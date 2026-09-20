import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import CellphoneIcon from "../common/CellphoneIcon";
import PlusIcon from "../common/PlusIcon";
import { useEffect, useState } from "react";
import API from "../../services/api";
import {
  Save,
  X,
  Check,
  Lock,
  FolderMinus,
  Database,
  AlertCircle,
  CheckCircle2,
  Tag,
  Type,
  Hash,
  ChevronDown,
  Info,
  CheckSquare,
  Link,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Clock,
  Award,
} from "lucide-react";
import toast from "react-hot-toast";
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
import CompanyIndustrySettings from "./CompanyIndustrySettings";
import AppToaster from "../AppToaster";
import ConfirmDialog from "../common/ConfirmDialog";
import UploadIcon from "../common/UploadIcon";
import ListIcon from "../common/ListIcon";
import EditIcon from "../common/EditIcon";

// The six fields every company form ships with. Hardcoded because they live on the Company model
// itself, not in the custom-fields collection - they exist whether or not an org configures
// anything. Previously written out as six near-identical cards in the render.
// Draggable field row, same pattern as KanbanSettings' stage rows: dnd-kit sortable applied to a
// <tr>, with a grip handle in its own narrow leading column. Field order is what the company form
// renders in, so reordering here changes the order people fill the form in.
const SortableFieldRow = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  // While dragging, the row itself just dims - the thing that follows the cursor is the
  // DragOverlay. A transformed <tr> cannot escape the table's own overflow-x-auto box, so without
  // an overlay a field dragged towards another section was clipped inside its own card.
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

// Wraps a section so a field can be dropped onto it even when it has no rows to drop between -
// without this an empty section could never receive anything.
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

const BUILT_IN_FIELDS = [
  { name: "Company Name", type: "String (Single-line)", required: true },
  { name: "Industry", type: "Dropdown", required: true },
  { name: "GSTIN", type: "String (Single-line)", required: false },
  { name: "Address", type: "String (Single-line)", required: false },
  { name: "Website", type: "URL", required: false },
  { name: "Profile Picture", type: "Image Upload", required: false },
];

const CompanyFieldSettings = () => {
  const [fields, setFields] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [newStandaloneCategory, setNewStandaloneCategory] = useState("");
  const [draggedFieldIndex, setDraggedFieldIndex] = useState(null);
  // 👉 NEW: State for editing categories
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState("");

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
  // Which table the card shows. Same pill switcher SystemDefaultsSettings.jsx uses for its
  // Task/Note/Meeting tabs - the two field lists are the same kind of thing, so they share one
  // card rather than stacking two.
  const [activeFieldTab, setActiveFieldTab] = useState("custom");

  const [activeDragId, setActiveDragId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Sections tab: a drag can both move a field to another section and reposition it. The drop
  // target is either another field (use its category) or a section's own droppable area (used for
  // empty sections, which have no row to aim at).
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

  // Reorder within the flat custom-field list. Persisted straight away (saveFields), the same way
  // KanbanSettings saves a stage reorder - there is no explicit save button on this page.
  const handleFieldReorder = (event) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => (f._id || f.name) === active.id);
    const newIndex = fields.findIndex((f) => (f._id || f.name) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    saveFields(arrayMove(fields, oldIndex, newIndex));
  };

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
      const res = await API.get("/company-fields");
      if (res.data) {
        setFields(res.data.fields || []);
        setAvailableCategories(res.data.fieldCategories || []); // NEW: Save categories to state
        setFieldDocId(res.data._id);
      }
    } catch (err) {
      console.error("Failed to fetch company fields", err);
      toast.error("Failed to load company fields");
    } finally {
      setLoading(false);
    }
  };

  const saveFields = async (updatedFields, categoriesToSave = availableCategories) => {
    try {
      const payload = {
        fields: updatedFields,
        fieldCategories: categoriesToSave, // Pass categories to backend
      };

      if (fieldDocId) {
        await API.put(`/company-fields/${fieldDocId}`, payload);
      } else {
        const res = await API.post("/company-fields", payload);
        setFieldDocId(res.data._id);
      }
      setFields(updatedFields);
      setAvailableCategories(categoriesToSave); // Keep local state in sync
      toast.success("Fields saved successfully!");
      return true;
    } catch (err) {
      console.error("Failed to save company fields", err);
      toast.error(err.response?.data?.error || "Failed to save");
    }
  };

  const handleCreateStandaloneCategory = async () => {
    const catName = newStandaloneCategory.trim();
    if (!catName) {
      toast.error("Please enter a category name");
      return;
    }
    if (availableCategories.includes(catName)) {
      toast.error("This category already exists");
      return;
    }

    // FIX: Instead of a new API route, we just use your proven saveFields function!
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

  const resetNewField = () => {
    setNewField({
      name: "",
      type: "text",
      options: [],
      required: false,
      category: "Uncategorized",
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

    resetNewField();
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
      category: "Uncategorized" // NEW: Reset the category state 
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

  const handleRemoveFromCategory = (index) => {
    const updatedFields = [...fields];
    updatedFields[index] = {
      ...updatedFields[index],
      category: "Uncategorized" // Resets the category
    };

    saveFields(updatedFields, availableCategories);
    toast.success("Field removed from category");
  };

  const handleDrop = (e, targetCategory) => {
    e.preventDefault(); // Crucial: Allows the drop to happen

    // Retrieve the index of the item being dragged from browser memory
    const draggedIdx = e.dataTransfer.getData("fieldIndex");
    if (draggedIdx === null || draggedIdx === "") return;

    const index = parseInt(draggedIdx, 10);
    const updatedFields = [...fields];

    // Don't save if dropping into the exact same category it's already in
    if (updatedFields[index].category === targetCategory) {
      setDraggedFieldIndex(null);
      return;
    }

    // Update the category and save
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
      const res = await API.put("/company-fields/categories", {
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
      const res = await API.delete(`/company-fields/categories/${encodeURIComponent(categoryName)}`);
      // Update state with fresh data from backend
      setAvailableCategories(res.data.categories);
      setFields(res.data.fields);
      toast.success("Category deleted successfully!");
    } catch (err) {
      console.error("Failed to delete category", err);
      toast.error(err.response?.data?.error || "Failed to delete category");
    }
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
          <p className="text-gray-600">Loading company fields...</p>
        </div>
      </div>
    );
  }

  const renderFieldItem = (field, index, isCategorized) => (
    <div
      key={index}
      draggable={editIndex !== index} // Can't drag while editing
      onDragStart={(e) => {
        e.dataTransfer.setData("fieldIndex", index); // Save index to browser memory
        setDraggedFieldIndex(index);
      }}
      onDragEnd={() => setDraggedFieldIndex(null)}
      className={`border-2 border-gray-200 bg-white rounded-xl p-4 sm:p-5 hover:border-blue-300 transition-all shadow-sm ${draggedFieldIndex === index ? 'opacity-50 ring-2 ring-blue-500 border-dashed' : ''} ${editIndex !== index ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {editIndex === index ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Field Name</label>
              <input type="text" value={editValue.name || ""} onChange={(e) => setEditValue({ ...editValue, name: e.target.value })} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Field Type</label>
              <select value={editValue.type || "text"} onChange={(e) => setEditValue({ ...editValue, type: e.target.value, options: (e.target.value === "dropdown" || e.target.value === "multiselect") ? editValue.options || [] : [] })} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm bg-white">
                {fieldTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
              <select value={editValue.category || "Uncategorized"} onChange={(e) => setEditValue({ ...editValue, category: e.target.value })} className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm bg-white">
                <option value="Uncategorized">Uncategorized</option>
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox checked={editValue.required || false} onChange={(e) => setEditValue((prev) => ({ ...prev, required: e.target.checked }))} id={`editRequired-${index}`} />
            <label htmlFor={`editRequired-${index}`} className="text-sm font-medium text-gray-700">Mark as required field</label>
          </div>

          {/* 👉 FULLY RESTORED DROPDOWN OPTIONS UI */}
          {(editValue.type === "dropdown" || editValue.type === "multiselect") && (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <ChevronDown className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-purple-900">
                  {editValue.type === "dropdown" ? "Dropdown Options" : "Multi-Select Options"}
                </h4>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Add option(s) - comma-separated"
                  value={newDropdownOption}
                  onChange={(e) => setNewDropdownOption(e.target.value)}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault(); // Stop forms from submitting!
                      addDropdownOption(true);
                    }
                  }}
                />
                <button type="button" onClick={() => addDropdownOption(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors w-full sm:w-auto">
                  <PlusIcon className="w-4 h-4" /> Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(editValue.options || []).map((option, optIndex) => (
                  <span key={optIndex} className="inline-flex items-center gap-2 bg-white border border-purple-300 text-purple-900 px-3 py-1.5 rounded-lg text-sm font-medium">
                    {option}
                    <button type="button" onClick={() => removeDropdownOption(optIndex, true)} className="text-purple-600 hover:text-purple-800">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleUpdate} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">Save</button>
            <button type="button" onClick={() => setEditIndex(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <GripVertical className="w-5 h-5 text-gray-400 cursor-grab hover:text-gray-600" /> {/* DRAG HANDLE */}
              <div className="bg-blue-100 p-1.5 rounded-lg">{getFieldTypeIcon(field.type)}</div>
              <span className="font-bold text-gray-900">{field.name}</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">{fieldTypes.find((t) => t.value === field.type)?.label || field.type}</span>
              {field.required && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200"><AlertCircle className="w-3 h-3" /> Required</span>}
            </div>
            {(field.type === "dropdown" || field.type === "multiselect") && field.options && (
              <div className="ml-10 flex flex-wrap gap-2">
                {field.options.map((opt, i) => <span key={i} className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg border border-gray-300">{opt}</span>)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
            {isCategorized && (
              <button type="button" onClick={() => handleRemoveFromCategory(index)} className="flex items-center gap-1 px-3 py-1.5 text-orange-600 hover:bg-orange-50 rounded-lg font-semibold text-xs border border-orange-200 transition-colors">
                <X className="w-3 h-3" /> Remove from section
              </button>
            )}
            <button type="button" onClick={() => handleEdit(index)} className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg font-semibold text-xs border border-blue-200 transition-colors">
              <EditIcon className="w-3 h-3" /> Edit
            </button>
            <button type="button" onClick={() => handleDelete(index)} className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg font-semibold text-xs border border-red-200 transition-colors">
              <DeleteIcon className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );

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

      {/* ------------------------------------------------------------------ *
       * NEW UI (System Defaults style). Built above the existing sections so
       * the old ones can be removed piece by piece; nothing below this block
       * has been changed. Shares the same state/handlers as the old UI, so
       * adding/editing/deleting here writes through the same code paths.
       * ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="relative inline-flex items-center bg-gray-100 rounded-full p-1 mb-5">
          {/* w-36, not the w-24 SystemDefaults uses - "Custom Section" does not fit 96px. */}
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
            placeholder="Add custom field (e.g. Annual Revenue)"
            className="flex-1 min-w-[200px] px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
          />
          <select
            value={newField.type}
            onChange={(e) => setNewField({ ...newField, type: e.target.value, options: [] })}
            className="px-4 py-2 text-sm rounded-full border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
          >
            {fieldTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={newField.category}
            onChange={(e) => setNewField({ ...newField, category: e.target.value })}
            className="px-4 py-2 text-sm rounded-full border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
          >
            <option value="Uncategorized">Uncategorized</option>
            {availableCategories.filter((c) => c !== "Uncategorized").map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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

        {/* Dropdown/multi-select need their options before the field can be saved, so the option
            editor only appears for those two types rather than sitting there permanently. */}
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
        {/* Same add-row shape as the Custom tab, creating a section instead of a field. Uses the
            existing handleCreateStandaloneCategory, so this and the old card write the same way. */}
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
        {/* One table per section, Uncategorized last - the same grouping the company form and the
            company detail view use. Section-level rename/delete sit in the group's header row;
            field rename/delete work exactly as on the Custom tab (shared handlers). */}
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

                {/* Uncategorized is not a real section - it is the absence of one - so it has no
                    rename/delete. */}
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
          These ship with every company form and cannot be edited or removed. Add your own under
          the Custom tab.
        </p>
        </>
        )}
      </div>


      <CompanyIndustrySettings />

      {/* Info Card */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              Field Type Guide
            </h3>
            <ul className="text-sm text-blue-700 space-y-1 leading-relaxed flex justify-between md:justify-start md:space-x-6 md:space-y-0">
              <div>
                <li>
                  • <strong>Text:</strong> Multi-line text area for long
                  descriptions
                </li>
                <li>
                  • <strong>String:</strong> Single-line input for short text
                </li>
              </div>
              <div>
                <li>
                  • <strong>Number:</strong> Numeric values only
                </li>
                <li>
                  • <strong>Dropdown:</strong> Select from predefined options
                </li>
              </div>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyFieldSettings;
