import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import CellphoneIcon from "../common/CellphoneIcon";
import PlusIcon from "../common/PlusIcon";
import { useEffect, useState } from "react";
import API from "../../services/api";
import {
  X,
  Check,
  AlertCircle,
  CheckCircle2,
  Type,
  Hash,
  ChevronDown,
  Info,
  Package,
  CheckSquare,
  Link,
  FolderOpen,
  FolderPlus,
  FolderMinus,
  Lock,
  GripVertical,
  Database,
  Clock,
  Award,
} from "lucide-react";
import toast from "react-hot-toast";
import AppToaster from "../AppToaster";
import ConfirmDialog from "../common/ConfirmDialog";
import UploadIcon from "../common/UploadIcon";
import ListIcon from "../common/ListIcon";
import EditIcon from "../common/EditIcon";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  closestCorners,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";

// Same pattern as CompanyFieldSettings' SortableFieldRow/DroppableSection.
const SortableFieldRow = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <td className="pl-4 pr-1 py-3 w-8">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      {children}
    </tr>
  );
};

const DroppableSection = ({ category, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${category}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl transition-colors ${isOver ? "bg-blue-50/60 ring-2 ring-[#0085FF]/30" : ""}`}
    >
      {children}
    </div>
  );
};

// The seven fields every vendor form ships with - live on the Vendor model itself, not the
// custom-fields collection, so they're hardcoded the same way CompanyFieldSettings' BUILT_IN_FIELDS is.
const BUILT_IN_FIELDS = [
  { name: "Vendor Name", type: "String (Single-line)", required: true },
  { name: "GSTIN", type: "String (15 digits)", required: false },
  { name: "Phone", type: "Phone", required: false },
  { name: "Email", type: "Email", required: false },
  { name: "Company", type: "String (Single-line)", required: false },
  { name: "Address", type: "Address (Multi-line)", required: false },
  { name: "Profile Picture", type: "Image Upload", required: false },
];

const VendorFieldSettings = () => {
  const [fields, setFields] = useState([]);
  const [newField, setNewField] = useState({
    name: "",
    type: "text",
    options: [],
    required: false,
    category: "Uncategorized",
  });
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState({
    name: "",
    type: "text",
    options: [],
    required: false,
    category: "Uncategorized",
  });
  const [fieldDocId, setFieldDocId] = useState(null);
  const [newDropdownOption, setNewDropdownOption] = useState("");
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(null);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  const [availableCategories, setAvailableCategories] = useState([]); // NEW
  const [newStandaloneCategory, setNewStandaloneCategory] = useState(""); // NEW
  const [draggedFieldIndex, setDraggedFieldIndex] = useState(null);
  // 👉 NEW: State for editing categories
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  // Which table the card shows - same pill switcher as CompanyFieldSettings.
  const [activeFieldTab, setActiveFieldTab] = useState("custom");
  const [activeDragId, setActiveDragId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );


  const fieldTypes = [
    {
      value: "text",
      label: "Text (Multi-line)",
      icon: <Type className="w-4 h-4" />,
    },
    {
      value: "string",
      label: "String (Single-line)",
      icon: <Type className="w-4 h-4" />,
    },
    {
      value: "number",
      label: "Number",
      icon: <Hash className="w-4 h-4" />,
    },
    {
      value: "dropdown",
      label: "Dropdown",
      icon: <ChevronDown className="w-4 h-4" />,
    },
    {
      value: "url",
      label: "URL",
      icon: <Link className="w-4 h-4" />,
    },
    {
      value: "date",
      label: "Date Picker",
      icon: <CalendarIcon className="w-4 h-4" />,
    },
    {
      value: "multiselect",
      label: "Multi-Select Checkbox",
      icon: <CheckSquare className="w-4 h-4" />,
    },
    {
      value: "file",
      label: "File",
      icon: <UploadIcon className="w-4 h-4" />,
    },
    {
      value: "socialProof",
      label: "Social Proof",
      icon: <Award className="w-4 h-4" />,
    },
    {
      value: "datetime",
      label: "Date-Time",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      value: "phone",
      label: "Phone Number",
      icon: <CellphoneIcon className="w-4 h-4" />,
    },
  ];


  useEffect(() => {
    fetchFields();
  }, []);


  const fetchFields = async () => {
    try {
      setLoading(true);
      const res = await API.get("/vendor-fields");
      if (res.data) {
        setFields(res.data.fields || []);
        setAvailableCategories(res.data.fieldCategories || []);
        setFieldDocId(res.data._id);
      }
    } catch (err) {
      console.error("Failed to fetch vendor fields", err);
      toast.error("Failed to load vendor fields");
    } finally {
      setLoading(false);
    }
  };


  const saveFields = async (updatedFields, categoriesToSave = availableCategories) => {
    try {
      const payload = { fields: updatedFields, fieldCategories: categoriesToSave };
      if (fieldDocId) {
        await API.put(`/vendor-fields/${fieldDocId}`, payload);
      } else {
        const res = await API.post("/vendor-fields", payload);
        setFieldDocId(res.data._id);
      }
      setFields(updatedFields);
      setAvailableCategories(categoriesToSave);
      toast.success("Fields saved successfully!");
      return true;
    } catch (err) {
      console.error("Failed to save vendor fields", err);
      toast.error(err.response?.data?.error || "Failed to save");
    }
  };

  // Sections tab: a drag can both move a field to another section and reposition it. Same logic
  // as CompanyFieldSettings.
  const handleSectionDragEnd = (event) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over) return;

    const keyOf = (f) => f._id || f.name;
    const activeIndex = fields.findIndex((f) => keyOf(f) === active.id);
    if (activeIndex === -1) return;

    const overId = String(over.id);
    const targetCategory = overId.startsWith("section:")
      ? overId.slice("section:".length)
      : (fields.find((f) => keyOf(f) === overId)?.category || "Uncategorized");

    const movedCategory = fields[activeIndex].category || "Uncategorized";
    const overIndex = overId.startsWith("section:")
      ? -1
      : fields.findIndex((f) => keyOf(f) === overId);

    if (movedCategory === targetCategory && (overIndex === -1 || overIndex === activeIndex)) return;

    let updated = fields.map((f, i) =>
      i === activeIndex ? { ...f, category: targetCategory } : f
    );
    if (overIndex !== -1) updated = arrayMove(updated, activeIndex, overIndex);

    saveFields(updated);
    if (movedCategory !== targetCategory) toast.success(`Moved to ${targetCategory}`);
  };

  // Reorder within the flat custom-field list. Persisted straight away.
  const handleFieldReorder = (event) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => (f._id || f.name) === active.id);
    const newIndex = fields.findIndex((f) => (f._id || f.name) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    saveFields(arrayMove(fields, oldIndex, newIndex));
  };

  const handleCreateStandaloneCategory = async () => {
    const catName = newStandaloneCategory.trim();
    if (!catName) return toast.error("Please enter a category name");
    if (availableCategories.includes(catName)) return toast.error("Category exists");

    const updatedCategories = [...availableCategories, catName];
    const success = await saveFields(fields, updatedCategories);
    if (success) {
      setNewStandaloneCategory("");
      toast.success(`Category "${catName}" created!`);
    }
  };

  const handleQuickAddToCategory = (categoryName) => {
    setNewField(prev => ({ ...prev, category: categoryName }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success(`Ready to add a field to "${categoryName}"`, { icon: '👇' });
  };

  const handleRemoveFromCategory = (index) => {
    const updatedFields = [...fields];
    updatedFields[index] = { ...updatedFields[index], category: "Uncategorized" };
    saveFields(updatedFields, availableCategories);
    toast.success("Field removed from category");
  };

  // --- NEW DRAG AND DROP HANDLER ---
  // --- FIXED DRAG AND DROP HANDLER ---
  const handleDrop = (e, targetCategory) => {
    e.preventDefault(); // Crucial
    const draggedIdx = e.dataTransfer.getData("fieldIndex");
    if (draggedIdx === null || draggedIdx === "") return;

    const index = parseInt(draggedIdx, 10);
    const updatedFields = [...fields];

    // Don't save if dropping in the same category
    if (updatedFields[index].category === targetCategory) {
      setDraggedFieldIndex(null);
      return;
    }

    updatedFields[index] = {
      ...updatedFields[index],
      category: targetCategory
    };
    saveFields(updatedFields, availableCategories);
    setDraggedFieldIndex(null);
    toast.success(`Moved to ${targetCategory}`);
  };

  // 👉 NEW: Start editing a category
  const handleEditCategoryStart = (categoryName) => {
    setEditingCategory(categoryName);
    setEditCategoryName(categoryName);
  };

  // 👉 NEW: Save renamed category
  const handleUpdateCategory = async (oldCategoryName) => {
    const trimmedNewName = editCategoryName.trim();
    if (!trimmedNewName) return toast.error("Category name cannot be empty");
    if (trimmedNewName === oldCategoryName) return setEditingCategory(null);

    try {
      const res = await API.put("/vendor-fields/categories", {
        oldCategoryName,
        newCategoryName: trimmedNewName
      });
      // Update state with fresh data from backend
      setAvailableCategories(res.data.categories);
      setFields(res.data.fields);
      setEditingCategory(null);
      toast.success("Category renamed successfully!");
    } catch (err) {
      console.error("Failed to rename category", err);
      toast.error(err.response?.data?.error || "Failed to rename category");
    }
  };

  // 👉 NEW: Delete category
  const handleDeleteCategory = (categoryName) => {
    setPendingDeleteCategory(categoryName);
  };

  const confirmDeleteCategory = async () => {
    const categoryName = pendingDeleteCategory;
    setPendingDeleteCategory(null);
    if (!categoryName) return;

    try {
      const res = await API.delete(`/vendor-fields/categories/${encodeURIComponent(categoryName)}`);
      // Update state with fresh data from backend
      setAvailableCategories(res.data.categories);
      setFields(res.data.fields);
      toast.success("Category deleted successfully!");
    } catch (err) {
      console.error("Failed to delete category", err);
      toast.error(err.response?.data?.error || "Failed to delete category");
    }
  };

  const resetNewField = () => {
    setNewField({
      name: "",
      type: "text",
      options: [],
      required: false,
      category: "Uncategorized"
    });
    setNewDropdownOption("");
  };


  const handleAdd = async () => {
    if (!newField.name.trim()) {
      toast.error("Field name is required");
      return;
    }

    // Split field names by comma and trim whitespace
    const fieldNames = newField.name
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (fieldNames.length === 0) {
      toast.error("Field name is required");
      return;
    }

    // Check if dropdown/multiselect has options
    if (
      (newField.type === "dropdown" || newField.type === "multiselect") &&
      newField.options.length === 0
    ) {
      toast.error(
        `${newField.type === "dropdown" ? "Dropdown" : "Multi-select"
        } fields must have at least one option`
      );
      return;
    }

    // NEW: Capture the category (default to Uncategorized if left blank)
    const assignedCategory = newField.category?.trim() || "Uncategorized";

    // Create multiple fields from comma-separated names
    const newFieldsToAdd = fieldNames.map((fieldName) => ({
      name: fieldName,
      type: newField.type,
      required: newField.required,
      category: assignedCategory, // NEW: Attach the category tag to the field
      ...(newField.type === "dropdown" || newField.type === "multiselect"
        ? { options: newField.options }
        : {}),
    }));

    // NEW: Check if this is a brand new category. If so, add it to our array!
    let updatedCategories = [...availableCategories];
    if (assignedCategory !== "Uncategorized" && !updatedCategories.includes(assignedCategory)) {
      updatedCategories.push(assignedCategory);
    }

    const updatedFields = [...fields, ...newFieldsToAdd];

    // NEW: Pass BOTH the updated fields and the updated categories to saveFields
    const fileSaved = await saveFields(updatedFields, updatedCategories);

    if (fieldNames.length > 1 && fileSaved) {
      toast.success(`${fieldNames.length} fields added successfully!`);
    }

    resetNewField(); // (Make sure your resetNewField function includes category: "Uncategorized" too!)
  };


  const handleEdit = (index) => {
    setEditIndex(index);
    setEditValue({ ...fields[index] });
  };


  const handleUpdate = async () => {
    if (!editValue.name.trim()) {
      toast.error("Field name is required");
      return;
    }

    if (
      (editValue.type === "dropdown" || editValue.type === "multiselect") &&
      (!editValue.options || editValue.options.length === 0)
    ) {
      toast.error(
        `${editValue.type === "dropdown" ? "Dropdown" : "Multi-select"
        } fields must have at least one option`
      );
      return;
    }

    // NEW: Capture the category (default to Uncategorized if left blank)
    const updatedCategory = editValue.category?.trim() || "Uncategorized";

    // NEW: Check if this is a brand new category typed into the edit form. If so, add it!
    let updatedCategories = [...availableCategories];
    if (updatedCategory !== "Uncategorized" && !updatedCategories.includes(updatedCategory)) {
      updatedCategories.push(updatedCategory);
    }

    const updatedFields = [...fields];
    updatedFields[editIndex] = {
      ...editValue,
      name: editValue.name.trim(),
      category: updatedCategory, // NEW: Ensure the updated category is saved to the field
    };

    // NEW: Pass BOTH the updated fields and the updated categories
    await saveFields(updatedFields, updatedCategories);

    setEditIndex(null);
    setEditValue({
      name: "",
      type: "text",
      options: [],
      required: false,
      category: "Uncategorized", // NEW: Reset the category state 
    });
  };


  const handleDelete = (index) => {
    setPendingDeleteIndex(index);
  };

  const confirmDeleteField = () => {
    const index = pendingDeleteIndex;
    setPendingDeleteIndex(null);
    if (index === null) return;
    const updated = fields.filter((_, i) => i !== index);
    saveFields(updated);
    toast.success("Field deleted successfully");
  };


  const addDropdownOption = (isEdit = false) => {
    const optionText = newDropdownOption.trim();

    if (!optionText) {
      toast.error("Option text cannot be empty");
      return;
    }

    // Split options by comma and trim whitespace
    const optionsToAdd = optionText
      .split(",")
      .map((option) => option.trim())
      .filter((option) => option.length > 0);

    if (optionsToAdd.length === 0) {
      toast.error("Option text cannot be empty");
      return;
    }

    if (isEdit) {
      const existingOptions = editValue.options || [];
      const duplicates = optionsToAdd.filter((opt) =>
        existingOptions.includes(opt)
      );

      if (duplicates.length > 0) {
        toast.error(`Option(s) already exist: ${duplicates.join(", ")}`);
        return;
      }

      setEditValue((prev) => ({
        ...prev,
        options: [...existingOptions, ...optionsToAdd],
      }));

      if (optionsToAdd.length > 1) {
        toast.success(`${optionsToAdd.length} options added!`);
      }
    } else {
      const duplicates = optionsToAdd.filter((opt) =>
        newField.options.includes(opt)
      );

      if (duplicates.length > 0) {
        toast.error(`Option(s) already exist: ${duplicates.join(", ")}`);
        return;
      }

      setNewField((prev) => ({
        ...prev,
        options: [...prev.options, ...optionsToAdd],
      }));

      if (optionsToAdd.length > 1) {
        toast.success(`${optionsToAdd.length} options added!`);
      }
    }

    setNewDropdownOption("");
  };


  const removeDropdownOption = (optionIndex, isEdit = false) => {
    if (isEdit) {
      setEditValue((prev) => ({
        ...prev,
        options: prev.options.filter((_, i) => i !== optionIndex),
      }));
    } else {
      setNewField((prev) => ({
        ...prev,
        options: prev.options.filter((_, i) => i !== optionIndex),
      }));
    }
  };


  const getFieldTypeIcon = (type) => {
    const fieldType = fieldTypes.find((t) => t.value === type);
    return fieldType?.icon || <Type className="w-4 h-4" />;
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vendor fields...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AppToaster />

      <ConfirmDialog
        isOpen={pendingDeleteIndex !== null}
        title="Delete field"
        message={
          pendingDeleteIndex !== null
            ? `Are you sure you want to delete "${fields[pendingDeleteIndex]?.name}" field?`
            : ""
        }
        onConfirm={confirmDeleteField}
        onCancel={() => setPendingDeleteIndex(null)}
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteCategory}
        title="Delete category"
        message={`Are you sure you want to delete the "${pendingDeleteCategory}" category?\n\nAny fields inside this category will be moved to "Uncategorized".`}
        onConfirm={confirmDeleteCategory}
        onCancel={() => setPendingDeleteCategory(null)}
      />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="relative inline-flex items-center bg-gray-100 rounded-full p-1 mb-5">
          <span
            className="absolute top-1 bottom-1 w-36 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
            style={{ left: 4 + ["custom", "sections", "builtin"].indexOf(activeFieldTab) * 144 }}
          />
          {[
            { id: "custom", label: "Custom Field" },
            { id: "sections", label: "Custom Section" },
            { id: "builtin", label: "Built-in" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFieldTab(tab.id)}
              className={`relative z-10 w-36 py-2 text-sm font-semibold rounded-full transition-colors ${
                activeFieldTab === tab.id ? "text-[#0085FF]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeFieldTab === "custom" && (
        <>
        <form
          onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
          className="flex flex-wrap gap-2 mb-5"
        >
          <input
            type="text"
            value={newField.name}
            onChange={(e) => setNewField({ ...newField, name: e.target.value })}
            placeholder="Add custom field (e.g. Payment Terms)"
            className="flex-1 min-w-[200px] px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
          />
          <div className="relative">
            <select
              value={newField.type}
              onChange={(e) => setNewField({ ...newField, type: e.target.value, options: [] })}
              className="appearance-none pl-4 pr-10 py-2 text-sm rounded-full border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
            >
              {fieldTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={newField.category}
              onChange={(e) => setNewField({ ...newField, category: e.target.value })}
              className="appearance-none pl-4 pr-10 py-2 text-sm rounded-full border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
            >
              <option value="Uncategorized">Uncategorized</option>
              {availableCategories.filter((c) => c !== "Uncategorized").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <label className="flex items-center gap-2 px-3 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newField.required}
              onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-[#0085FF] focus:ring-[#0085FF]/30"
            />
            Required
          </label>
          <button
            type="submit"
            disabled={!newField.name.trim()}
            className="flex-shrink-0 px-4 py-2 bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <PlusIcon className="w-4 h-4" /> Add
          </button>
        </form>

        {(newField.type === "dropdown" || newField.type === "multiselect") && (
          <div className="mb-5 rounded-xl border border-[#E1E4EA] p-3.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={newDropdownOption}
                onChange={(e) => setNewDropdownOption(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDropdownOption(false); } }}
                placeholder="Add option (comma-separate for several)"
                className="flex-1 min-w-0 px-4 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
              />
              <button
                type="button"
                onClick={() => addDropdownOption(false)}
                className="flex-shrink-0 px-3.5 py-1.5 text-sm font-semibold rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Add option
              </button>
            </div>
            {newField.options?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {newField.options.map((opt, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-700">
                    {opt}
                    <button
                      type="button"
                      onClick={() => setNewField({ ...newField, options: newField.options.filter((_, oi) => oi !== i) })}
                      className="text-gray-400 hover:text-red-500"
                      title="Remove option"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {fields.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-[#E1E4EA]">
            <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600">No custom fields yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Add your first field to get started</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragStart={(e) => setActiveDragId(e.active.id)}
            onDragCancel={() => setActiveDragId(null)}
            onDragEnd={handleFieldReorder}
          >
          <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
            <table className="min-w-full border-collapse text-sm text-left">
              <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                <tr>
                  <th className="w-8" />
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Field</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Category</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Required</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                <SortableContext
                  items={fields.map((f) => f._id || f.name)}
                  strategy={verticalListSortingStrategy}
                >
                {fields.map((field, index) => {
                  const isEditing = editIndex === index;
                  return (
                    <SortableFieldRow key={field._id || field.name} id={field._id || field.name}>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue.name}
                            onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                            className="w-full max-w-xs px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#0085FF]" />
                            <span className="text-sm font-semibold text-gray-900">{field.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600">
                          {fieldTypes.find((t) => t.value === field.type)?.label || field.type}
                        </span>
                        {(field.type === "dropdown" || field.type === "multiselect") && field.options?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {field.options.map((opt, i) => (
                              <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600">
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600">{field.category || "Uncategorized"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {field.required ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FCEAEA] text-[#EA4B4B]">
                            Required
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EEF2F9] text-[#56698A]">
                            Optional
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={handleUpdate}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditIndex(null)}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEdit(index)}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(index)}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <DeleteIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </SortableFieldRow>
                  );
                })}
                </SortableContext>
              </tbody>
            </table>
          </div>
          <DragOverlay>
            {activeDragId ? (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-[#E1E4EA] bg-white shadow-xl">
                <GripVertical className="w-4 h-4 text-gray-300" />
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#0085FF]" />
                <span className="text-sm font-semibold text-gray-900">
                  {fields.find((f) => (f._id || f.name) === activeDragId)?.name}
                </span>
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
        )}
        </>
        )}

        {activeFieldTab === "sections" && (
        <>
        <form
          onSubmit={(e) => { e.preventDefault(); handleCreateStandaloneCategory(); }}
          className="flex gap-2 mb-5"
        >
          <input
            type="text"
            value={newStandaloneCategory}
            onChange={(e) => setNewStandaloneCategory(e.target.value)}
            placeholder="Add section (e.g. Financial Information)"
            className="flex-1 min-w-0 px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
          />
          <button
            type="submit"
            disabled={!newStandaloneCategory.trim()}
            className="flex-shrink-0 px-4 py-2 bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <PlusIcon className="w-4 h-4" /> Add
          </button>
        </form>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={(e) => setActiveDragId(e.active.id)}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={handleSectionDragEnd}
        >
        {Object.entries(
          fields.reduce((acc, field) => {
            const cat = field.category || "Uncategorized";
            (acc[cat] = acc[cat] || []).push(field);
            return acc;
          }, availableCategories.reduce((acc, c) => ({ ...acc, [c]: [] }), {}))
        )
          .sort(([a], [b]) => {
            if (a === "Uncategorized") return 1;
            if (b === "Uncategorized") return -1;
            return a.localeCompare(b);
          })
          .map(([category, catFields]) => (
            <DroppableSection key={category} category={category}>
            <div className="mb-5 last:mb-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                {editingCategory === category ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editCategoryName}
                      onChange={(e) => setEditCategoryName(e.target.value)}
                      className="px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateCategory(category)}
                      className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCategory(null)}
                      className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-gray-900">{category}</h4>
                    <span className="text-xs text-gray-400">
                      {catFields.length} {catFields.length === 1 ? "field" : "fields"}
                    </span>
                  </div>
                )}

                {category !== "Uncategorized" && editingCategory !== category && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditCategoryStart(category)}
                      className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Rename section"
                    >
                      <EditIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete section"
                    >
                      <DeleteIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {catFields.length === 0 ? (
                <div className="text-center py-8 rounded-xl border border-dashed border-[#E1E4EA] text-xs text-gray-400">
                  No fields yet - drag one here
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
                  <table className="min-w-full border-collapse text-sm text-left">
                    <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                      <tr>
                        <th className="w-8" />
                        <th className="px-4 py-3 text-sm font-bold text-[#525866]">Field</th>
                        <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                        <th className="px-4 py-3 text-sm font-bold text-[#525866]">Required</th>
                        <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <SortableContext
                        items={catFields.map((f) => f._id || f.name)}
                        strategy={verticalListSortingStrategy}
                      >
                      {catFields.map((field) => {
                        const index = fields.indexOf(field);
                        const isEditing = editIndex === index;
                        return (
                          <SortableFieldRow key={field._id || field.name} id={field._id || field.name}>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValue.name}
                                  onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                                  className="w-full max-w-xs px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
                                  autoFocus
                                />
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#0085FF]" />
                                  <span className="text-sm font-semibold text-gray-900">{field.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-gray-600">
                                {fieldTypes.find((t) => t.value === field.type)?.label || field.type}
                              </span>
                              {(field.type === "dropdown" || field.type === "multiselect") && field.options?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {field.options.map((opt, i) => (
                                    <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600">
                                      {opt}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {field.required ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FCEAEA] text-[#EA4B4B]">
                                  Required
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EEF2F9] text-[#56698A]">
                                  Optional
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={handleUpdate}
                                    className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                                    title="Save"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditIndex(null)}
                                    className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                                    title="Cancel"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  {category !== "Uncategorized" && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFromCategory(index)}
                                      className="flex items-center justify-center w-7 h-7 rounded-full text-orange-600 hover:bg-orange-50 transition-colors"
                                      title="Remove from section"
                                    >
                                      <FolderMinus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(index)}
                                    className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Edit"
                                  >
                                    <EditIcon className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(index)}
                                    className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors"
                                    title="Delete"
                                  >
                                    <DeleteIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </SortableFieldRow>
                        );
                      })}
                      </SortableContext>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </DroppableSection>
          ))}
          <DragOverlay>
            {activeDragId ? (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-[#E1E4EA] bg-white shadow-xl">
                <GripVertical className="w-4 h-4 text-gray-300" />
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#0085FF]" />
                <span className="text-sm font-semibold text-gray-900">
                  {fields.find((f) => (f._id || f.name) === activeDragId)?.name}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        </>
        )}

        {activeFieldTab === "builtin" && (
        <>
        <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
          <table className="min-w-full border-collapse text-sm text-left">
            <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
              <tr>
                <th className="px-4 py-3 text-sm font-bold text-[#525866]">Field</th>
                <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                <th className="px-4 py-3 text-sm font-bold text-[#525866]">Required</th>
                <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {BUILT_IN_FIELDS.map((field) => (
                <tr key={field.name} className="group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
                      <span className="text-sm font-semibold text-gray-900">{field.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600">{field.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    {field.required ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FCEAEA] text-[#EA4B4B]">
                        Required
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EEF2F9] text-[#56698A]">
                        Optional
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-900">
                      <Lock className="w-3 h-3" /> System field
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          These ship with every vendor form and cannot be edited or removed. Add your own under
          the Custom tab.
        </p>
        </>
        )}
      </div>
    </div>
  );
};


export default VendorFieldSettings;
