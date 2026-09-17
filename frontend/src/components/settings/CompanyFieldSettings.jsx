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
import CompanyIndustrySettings from "./CompanyIndustrySettings";
import AppToaster from "../AppToaster";
import ConfirmDialog from "../common/ConfirmDialog";
import UploadIcon from "../common/UploadIcon";
import ListIcon from "../common/ListIcon";
import EditIcon from "../common/EditIcon";

const defaultIndustries = [
  "Information Technology & Services",
  "Finance & Banking",
  "Healthcare & Pharmaceuticals",
  "Education & EdTech",
  "Retail & E-Commerce",
  "Manufacturing",
  "Real Estate",
  "Marketing & Advertising",
  "Travel & Hospitality",
  "Nonprofit / Government / Public Sector"
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

      {/* Built-in Mandatory Fields */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="bg-amber-100 p-2 rounded-lg">
            <Database className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Built-in Mandatory Fields</h3>
        </div>

        <div className="space-y-3">
          {/* Each field card */}
          <div className="border-2 border-gray-200 rounded-xl p-4 sm:p-5 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <div className="bg-blue-100 p-1.5 rounded-lg">
                    <Type className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-gray-900">Company Name</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    String (Single-line)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200">
                    <AlertCircle className="w-3 h-3" />
                    Required
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full font-medium whitespace-nowrap mt-2 sm:mt-0">
                System Field
              </span>
            </div>
          </div>

          <div className="border-2 border-gray-200 rounded-xl p-4 sm:p-5 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <div className="bg-blue-100 p-1.5 rounded-lg">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-gray-900">Industry</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    Dropdown
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200">
                    <AlertCircle className="w-3 h-3" />
                    Required
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full font-medium whitespace-nowrap mt-2 sm:mt-0">
                System Field
              </span>
            </div>
          </div>

          <div className="border-2 border-gray-200 rounded-xl p-4 sm:p-5 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <div className="bg-blue-100 p-1.5 rounded-lg">
                    <Type className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-gray-900">GSTIN</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    String (Single-line)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full border border-gray-200">
                    Optional
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full font-medium whitespace-nowrap mt-2 sm:mt-0">
                System Field
              </span>
            </div>
          </div>

          <div className="border-2 border-gray-200 rounded-xl p-4 sm:p-5 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <div className="bg-blue-100 p-1.5 rounded-lg">
                    <Type className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-gray-900">Address</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    String (Single-line)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full border border-gray-200">
                    Optional
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full font-medium whitespace-nowrap mt-2 sm:mt-0">
                System Field
              </span>
            </div>
          </div>

          <div className="border-2 border-gray-200 rounded-xl p-4 sm:p-5 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <div className="bg-blue-100 p-1.5 rounded-lg">
                    <Type className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-gray-900">Website</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    URL
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full border border-gray-200">
                    Optional
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full font-medium whitespace-nowrap mt-2 sm:mt-0">
                System Field
              </span>
            </div>
          </div>

          <div className="border-2 border-gray-200 rounded-xl p-4 sm:p-5 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <div className="bg-blue-100 p-1.5 rounded-lg">
                    <UploadIcon className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-gray-900">Profile Picture</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    Image Upload
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full border border-gray-200">
                    Optional
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full font-medium whitespace-nowrap mt-2 sm:mt-0">
                System Field
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              These are built-in system fields that appear by default in every company form. You cannot edit or remove these fields, but you can add custom fields below.
            </p>
          </div>
        </div>
      </div>


      {/* Add New Field */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-green-100 p-2 rounded-lg">
            <PlusIcon className="w-4 h-4 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Add New Field</h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Field Name(s)
                <span className="text-xs font-normal text-gray-500 ml-2">
                  (Comma-separated for multiple)
                </span>
              </label>
              <input
                type="text"
                placeholder="e.g., Annual Revenue, Employee Count, Due Date"
                value={newField.name || ""}
                onChange={(e) =>
                  setNewField((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 Tip: Enter multiple field names separated by commas to create
                them all at once
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Field Type
              </label>
              <select
                value={newField.type}
                onChange={(e) =>
                  setNewField((prev) => ({
                    ...prev,
                    type: e.target.value,
                    options:
                      e.target.value === "dropdown" ||
                        e.target.value === "multiselect"
                        ? prev.options
                        : [],
                  }))
                }
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
              >
                {fieldTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center">
            <Checkbox checked={newField.required || false} onChange={(e) =>
                setNewField((prev) => ({ ...prev, required: e.target.checked }))
              } id="newRequired" />
            <label
              htmlFor="newRequired"
              className="ml-2 text-sm font-medium text-gray-700"
            >
              Mark as required field
            </label>
          </div>

          {/* Dropdown/Multiselect Options */}
          {(newField.type === "dropdown" || newField.type === "multiselect") && (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <ChevronDown className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-purple-900">
                  {newField.type === "dropdown"
                    ? "Dropdown Options"
                    : "Multi-Select Options"}
                </h4>
              </div>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Add option(s) - comma-separated (e.g., Small, Medium, Large)"
                  value={newDropdownOption}
                  onChange={(e) => setNewDropdownOption(e.target.value)}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  onKeyPress={(e) => e.key === "Enter" && addDropdownOption()}
                />
                <button
                  onClick={() => addDropdownOption()}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add
                </button>
              </div>
              <p className="text-xs text-purple-600 mb-3">
                💡 Tip: Enter multiple options separated by commas to add them all
                at once
              </p>
              <div className="flex flex-wrap gap-2">
                {newField.options.map((option, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 bg-white border border-purple-300 text-purple-900 px-3 py-1.5 rounded-lg text-sm font-medium"
                  >
                    {option}
                    <button
                      onClick={() => removeDropdownOption(index)}
                      className="text-purple-600 hover:text-purple-800"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              {newField.options.length === 0 && (
                <p className="text-sm text-purple-700 mt-2">
                  No options added yet. Add at least one option.
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleAdd}
            style={{ backgroundColor: "#0085FF" }}
            className="flex items-center gap-2 hover:opacity-90 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg"
          >
            <PlusIcon className="w-4 h-4" />
            Add Field(s)
          </button>
        </div>
      </div>

      {/* Standalone Category Creator */}
      <div className="bg-blue-50 rounded-2xl border-2 border-blue-200 shadow-sm p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <FolderPlus className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-blue-900">Create Empty Section</h3>
              <p className="text-xs text-blue-700">Create a new section to organize future fields</p>
            </div>
          </div>
          <div className="flex w-full sm:w-auto gap-2">
            <input
              type="text"
              placeholder="e.g., Financial Information"
              value={newStandaloneCategory}
              onChange={(e) => setNewStandaloneCategory(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateStandaloneCategory()}
              className="flex-1 sm:w-64 px-4 py-2 border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={handleCreateStandaloneCategory}
              style={{ backgroundColor: "#0085FF" }}
              className="hover:opacity-90 text-white px-4 py-2 rounded-xl font-semibold transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <PlusIcon className="w-4 h-4" /> Create
            </button>
          </div>
        </div>
      </div>

      {/* Configured Fields grouped by Categories */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <ListIcon className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Custom Sections & Fields</h3>
          </div>
        </div>

        {fields.length === 0 && availableCategories.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
            <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-2">No custom fields or categories configured yet</p>
          </div>
        ) : (
          <div className="space-y-6">

            <div className="space-y-6">

              {/* 1. Categorized Fields */}
              {availableCategories.map((categoryName, catIndex) => {
                const categoryFields = fields.filter(f => f.category === categoryName);

                return (
                  <div
                    key={catIndex}
                    onDragOver={(e) => e.preventDefault()} // 👉 MUST HAVE THIS to allow dropping
                    onDrop={(e) => handleDrop(e, categoryName)} // 👉 Triggers the save
                    className={`border-2 border-purple-200 rounded-xl overflow-hidden bg-white shadow-sm transition-colors ${draggedFieldIndex !== null ? 'border-dashed border-purple-400 bg-purple-50/30 pb-4' : ''}`}
                  >
                    <div className="bg-purple-50 px-5 py-4 border-b-2 border-purple-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      {editingCategory === categoryName ? (
                        // --- EDIT MODE ---
                        <div className="flex flex-1 items-center gap-3 w-full">
                          <input
                            type="text"
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleUpdateCategory(categoryName)}
                            className="flex-1 px-3 py-1.5 border-2 border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-semibold text-purple-900"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateCategory(categoryName)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Save
                            </button>
                            <button onClick={() => setEditingCategory(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // --- VIEW MODE ---
                        <>
                          <div>
                            <h4 className="font-bold text-purple-900 text-lg flex items-center gap-2">
                              {categoryName}
                              <span className="bg-purple-200 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                {categoryFields.length} Fields
                              </span>
                            </h4>
                          </div>
                          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                            <button
                              type="button"
                              onClick={() => handleQuickAddToCategory(categoryName)}
                              className="text-xs font-semibold text-purple-700 hover:text-purple-900 hover:bg-purple-100 flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-purple-300 shadow-sm transition-colors whitespace-nowrap"
                            >
                              <PlusIcon className="w-4 h-4" /> Add Field
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditCategoryStart(categoryName)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-blue-200 shadow-sm transition-colors"
                              title="Rename Section"
                            >
                              <EditIcon className="w-3 h-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(categoryName)}
                              className="text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-red-200 shadow-sm transition-colors"
                              title="Delete Section"
                            >
                              <DeleteIcon className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Add min-h so you can drop into empty categories easily */}
                    <div className="p-4 bg-gray-50/50 space-y-3 min-h-[60px]">
                      {categoryFields.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4 italic pointer-events-none">No fields. Drag and drop a field here.</p>
                      ) : (
                        categoryFields.map((field) => renderFieldItem(field, fields.findIndex(f => f.name === field.name), true))
                      )}
                    </div>
                  </div>
                );
              })}

              {/* 2. Uncategorized Fields */}
              {fields.filter(f => !f.category || f.category === 'Uncategorized').length > 0 && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, "Uncategorized")}
                  className={`border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm mt-8 transition-colors ${draggedFieldIndex !== null ? 'border-dashed border-gray-400 bg-gray-50 pb-4' : ''}`}
                >
                  <div className="bg-gray-100 px-5 py-4 border-b-2 border-gray-200">
                    <h4 className="font-bold text-gray-700 text-lg flex items-center gap-2">
                      Uncategorized Fields
                    </h4>
                  </div>
                  <div className="p-4 bg-gray-50/50 space-y-3 min-h-[60px]">
                    {fields.filter(f => !f.category || f.category === 'Uncategorized').map((field) =>
                      renderFieldItem(field, fields.findIndex(f => f.name === field.name), false)
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Place this helper function right here, before the Default System Industries block */}
      {(() => {
        // This is a neat trick to render a helper function inside JSX!
        // We do this to avoid having to place it outside the return block.
        return null;
      })()}


      {/* Default System Industries */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-100 p-2 rounded-lg">
            <Tag className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">
            Default System Industries
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {defaultIndustries.map((industry, index) => (
            <div
              key={index}
              className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50 flex items-center justify-between hover:border-gray-300 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Tag className="w-4 h-4 text-blue-600" />
                </div>
                <span className="font-semibold text-gray-900">{industry}</span>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full font-medium">
                System
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              These are default system industries available in all company forms.
              You cannot edit or remove these industries, but you can add custom
              industries below.
            </p>
          </div>
        </div>
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
