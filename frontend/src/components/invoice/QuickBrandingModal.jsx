import Checkbox from "../common/Checkbox";
import { useState, useEffect } from 'react';
import { X, Building2, AlertCircle, CheckCircle2 } from 'lucide-react';
import API from '../../services/api';
import toast from 'react-hot-toast';
import { INDIA_STATES } from '../../constants/addressOptions';
import UploadIcon from "../common/UploadIcon";

const QuickBrandingModal = ({ isOpen, onClose, onComplete }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    gstin: '',
    address: '',
    city: '',
    pincode: '',
    state: '',
    email: '',
    mobile: '',
    logoBase64: '',
    signatureBase64: ''
  });
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [existingBranding, setExistingBranding] = useState(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);  // NEW

  useEffect(() => {
    let timeoutId;
    if (isOpen) {
      timeoutId = setTimeout(() => {
        if (localStorage.getItem('showBrandingModal') === 'false') {
          onComplete?.();
          onClose?.();
        } else {
          setShouldRender(true); // Only show modal after check
          fetchExistingBranding();
        }
      }, 0);
    } else {
      setShouldRender(false);
    }
    return () => {
      clearTimeout(timeoutId);
      setShouldRender(false);
    };
  }, [isOpen]);

  const fetchExistingBranding = async () => {
    try {
      const response = await API.get('/branding/invoice-check');
      if (response.data.branding) {
        setExistingBranding(response.data.branding);
        setFormData({
          companyName: response.data.branding.companyName || '',
          gstin: response.data.branding.gstin || '',
          address: response.data.branding.address || '',
          city: response.data.branding.city || '',
          pincode: response.data.branding.pincode || '',
          state: response.data.branding.state || '',
          email: response.data.branding.email || '',
          mobile: response.data.branding.mobile || '',
          logoBase64: response.data.branding.logoUrl || '',
          signatureBase64: response.data.branding.signatureUrl || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch branding:', error);
    }
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.error('Image must be less than 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setEmailError('Invalid email format');
      return;
    }
    setEmailError('');

    setLoading(true);

    try {
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key] && key !== 'logoBase64' && key !== 'signatureBase64') {
          formDataToSend.append(key, formData[key]);
        }
      });

      if (formData.logoBase64) {
        formDataToSend.append('logoBase64', formData.logoBase64);
      }
      if (formData.signatureBase64) {
        formDataToSend.append('signatureBase64', formData.signatureBase64);
      }
      formDataToSend.append('colors', JSON.stringify({
        primary: '#3B82F6',
        secondary: '#1E40AF'
      }));

      await API.post('/branding/partial', formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Invoice branding details saved!');
      if (dontShowAgain) localStorage.setItem('showBrandingModal', 'false');
      onComplete?.();
      onClose?.();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save branding details');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    toast('You can add branding details later from Settings', { icon: 'ℹ️' });
    if (dontShowAgain) localStorage.setItem('showBrandingModal', 'false');
    onComplete?.();
    onClose?.();
  };

  // Only render modal after localStorage check
  if (!(isOpen && shouldRender)) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100002] p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Complete Invoice Details</h2>
              <p className="text-sm text-gray-600">These details will appear on your invoices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Why fill these details?</p>
              <p>These details will be displayed on all your invoices. You can skip this now and add them later from Settings.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter company name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GSTIN</label>
              <input
                type="text"
                value={formData.gstin}
                onChange={(e) => setFormData(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="22AAAAA0000A1Z5"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="2"
                placeholder="Enter company address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. Mumbai"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">PIN Code</label>
                <input
                  type="text"
                  value={formData.pincode}
                  onChange={(e) => setFormData(prev => ({ ...prev, pincode: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. 400001"
                  maxLength="6"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Seller State (for GST)</label>
              <select
                value={formData.state}
                onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select state...</option>
                {INDIA_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Used to auto-detect Intra/Inter state (CGST+SGST vs IGST) on invoices.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, email: e.target.value }));
                  if (emailError) setEmailError('');
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  emailError ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="company@example.com"
              />
              {emailError && (
                <p className="mt-1 text-xs text-red-600">{emailError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number</label>
              <input
                type="tel"
                inputMode="numeric"
                value={formData.mobile}
                onChange={(e) => setFormData(prev => ({ ...prev, mobile: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="9876543210"
                maxLength="10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                {formData.logoBase64 ? (
                  <div className="relative">
                    <img
                      src={formData.logoBase64}
                      alt="Logo"
                      className="max-h-32 mx-auto rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, logoBase64: '' }))}
                      className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <UploadIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Click to upload logo</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'logoBase64')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Signature</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                {formData.signatureBase64 ? (
                  <div className="relative">
                    <img
                      src={formData.signatureBase64}
                      alt="Signature"
                      className="max-h-32 mx-auto rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, signatureBase64: '' }))}
                      className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <UploadIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Click to upload signature</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'signatureBase64')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Do not show again */}
          <div className="flex items-center gap-2 pt-2">
            <Checkbox checked={dontShowAgain} onChange={e => setDontShowAgain(e.target.checked)} id="branding-dont-show-again" />
            <label
              htmlFor="branding-dont-show-again"
              className="text-sm text-gray-700 select-none cursor-pointer"
            >
              Do not show again
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Skip for Now
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Save & Continue
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickBrandingModal;
