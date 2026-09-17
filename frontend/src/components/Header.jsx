import PlusIcon from "./common/PlusIcon";
// import { useEffect, useState } from "react";
// import { useLocation, useNavigate } from "react-router-dom";
// import {
//   Search,
//   Plus,
//   X,
//   User,
//   Building,
//   Users,
//   IndianRupeeIcon,
//   CheckCircle,
//   //   Phone,
//   ChevronRight,
//   Sparkles,
//   Clock,
// } from "lucide-react";
// import SearchResults from "./SearchResults";
// import QuickCompanyForm from "./company/QuickCompanyForm";
// import QuickContactForm from "./contact/QuickContactForm";
// import QuickVendorForm from "./vendor/QuickVendorForm";
// import QuickDealForm from "./deal/QuickDealForm";
// import QuickTaskForm from "./Task/QuickTaskForm";
// import QuickCallLogForm from "./contact/QuickCallLogForm";
// import API, { configureAxios } from "../services/api";
// import { useAuth0 } from "@auth0/auth0-react";

// // Shimmer UI Component for Branding
// const BrandingShimmer = () => {
//   return (
//     <div className="flex items-center gap-3">
//       <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse"></div>
//       <div className="h-5 w-24 bg-gray-200 animate-pulse rounded"></div>
//     </div>
//   );
// };

// const Header = () => {
//   const [searchQuery, setSearchQuery] = useState("");
//   const [debouncedQuery, setDebouncedQuery] = useState("");
//   const [isSearchOpen, setIsSearchOpen] = useState(false);
//   const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
//   const [hoveredMeeting, setHoveredMeeting] = useState(false);
//   const [showQuickCompanyForm, setShowQuickCompanyForm] = useState(false);
//   const [showQuickContactForm, setShowQuickContactForm] = useState(false);
//   const [showQuickVendorForm, setShowQuickVendorForm] = useState(false);
//   const [showQuickDealForm, setShowQuickDealForm] = useState(false);
//   const [showQuickTaskForm, setShowQuickTaskForm] = useState(false);
//   const [showQuickCallLogForm, setShowQuickCallLogForm] = useState(false);
//   const [showQuickMeetingForm, setShowQuickMeetingForm] = useState(false);
//   const [meetingType, setMeetingType] = useState("");
//   const [companies, setCompanies] = useState([]);
//   const [contacts, setContacts] = useState([]);
//   const [branding, setBranding] = useState(null);
//   const [isLoadingData, setIsLoadingData] = useState(false);
//   const location = useLocation();
//   const navigate = useNavigate();
//   const { getAccessTokenSilently } = useAuth0();
//   const isSuperAdmin = !!localStorage.getItem("superAdminToken");
//   const [isTrialActive, setIsTrialActive] = useState(false);
//   const [trialEnd, setTrialEnd] = useState(null);
//   const [trialLeftLabel, setTrialLeftLabel] = useState("");
//   const [trialUsed, setTrialUsed] = useState(false);
//   const [isPaymentConfirmed, setIsPaymentConfirmed] = useState(false);

//   const isSuperAdminRoute = location.pathname.startsWith("/super-admin");

//   const getInitials = (name) => {
//     if (!name || !name.trim()) return "?";
//     const words = name.trim().split(" ");
//     if (words.length === 1) {
//       return words[0][0].toUpperCase();
//     } else {
//       return (words[0][0] + words[1][0]).toUpperCase();
//     }
//   };

//   const getRandomColor = (name) => {
//     const colors = [
//       "bg-red-500",
//       "bg-green-500",
//       "bg-blue-500",
//       "bg-yellow-500",
//       "bg-purple-500",
//       "bg-pink-500",
//       "bg-indigo-500",
//       "bg-gray-500",
//     ];
//     if (!name) return colors[0];
//     const charCode = name.charCodeAt(0);
//     return colors[charCode % colors.length];
//   };

//   const renderCompanyLogo = () => {
//     if (branding?.logoUrl) {
//       // If logoUrl is a data URL, blob URL, or full HTTP URL, use it directly; otherwise prefix API URL
//       const src =
//         typeof branding.logoUrl === "string" &&
//         (branding.logoUrl.startsWith("data:") ||
//           branding.logoUrl.startsWith("blob:") ||
//           branding.logoUrl.startsWith("http"))
//           ? branding.logoUrl
//           : `${import.meta.env.VITE_APP_API_URL}${branding.logoUrl}`;

//       return (
//         <img
//           src={src}
//           alt="Company Logo"
//           className="h-9 w-9 rounded-full object-cover flex-shrink-0"
//         />
//       );
//     } else {
//       const src = `/DataCircles.png`;
//       return (
//         <img
//           src={src}
//           alt="Company Logo"
//           className="h-9 w-9 rounded-md object-cover flex-shrink-0 drop-shadow-lg"
//           style={{
//             filter: "invert(100%)",
//           }}
//         />
//       );
//     }
//   };

//   useEffect(() => {
//   if (!isSuperAdmin && !isSuperAdminRoute) {
//     configureAxios(getAccessTokenSilently);
//     const fetchData = async () => {
//       setIsLoadingData(true);
//       try {
//         const [companiesRes, contactsRes, brandingRes, authRes] = await Promise.all([
//           API.get("/companies"),
//           API.get("/contacts"),
//           API.get("/branding"),
//           API.get("/auth/me")
//         ]);
//         setCompanies(companiesRes.data);
//         setContacts(contactsRes.data);
//         setBranding(brandingRes.data);
//         setIsTrialActive(authRes.data.isTrialActive);
//         setTrialEnd(authRes.data.trialEnd);
//         setTrialUsed(authRes.data.trialUsed); // Add this
//         setIsPaymentConfirmed(authRes.data.isPaymentConfirmed); // Add this
//       } catch (err) {
//         console.error("Failed to fetch data:", err);
//       } finally {
//         setIsLoadingData(false);
//       }
//     };
//     fetchData();
//   } else {
//     setBranding({ companyName: "Data Circles Admin", logoUrl: null });
//   }
// }, [isSuperAdmin, isSuperAdminRoute, getAccessTokenSilently]);

// useEffect(() => {
//   // Show badge if trial is active OR trial ended without payment
//   const shouldShowTrialBadge = isTrialActive || (trialUsed && !isPaymentConfirmed);

//   if (!shouldShowTrialBadge || !trialEnd) {
//     setTrialLeftLabel("");
//     return;
//   }

//   const endTime = new Date(trialEnd).getTime();

//   function updateLabel() {
//     const now = Date.now();
//     const diff = endTime - now;

//     if (diff <= 0) {
//       setTrialLeftLabel("Trial ended");
//       return;
//     }

//     // Use Math.ceil for days to round UP (shows 7 days if 6d 23h left)
//     const totalHours = diff / (1000 * 60 * 60);
//     const days = Math.ceil(totalHours / 24);

//     // For the countdown, use floor for precision
//     const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
//     const minutes = Math.floor((diff / (1000 * 60)) % 60);
//     const seconds = Math.floor((diff / 1000) % 60);

//     // Show days if 24+ hours remaining, otherwise show HH:MM:SS
//     if (totalHours >= 24) {
//       setTrialLeftLabel(`Trial ends in ${days} day${days > 1 ? "s" : ""}`);
//     } else {
//       setTrialLeftLabel(
//         `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`
//       );
//     }
//   }

//   updateLabel();
//   let interval = null;

//   // Only run interval if trial is still active
//   if (isTrialActive && trialEnd) {
//     interval = setInterval(updateLabel, 1000);
//   }

//   return () => interval && clearInterval(interval);
// }, [isTrialActive, trialEnd, trialUsed, isPaymentConfirmed]);

//   useEffect(() => {
//     if (!isSuperAdminRoute && !isSuperAdmin) {
//       if (isSearchOpen) {
//         handleSearchClose();
//       }
//       if (isAddMenuOpen) {
//         handleAddMenuClose();
//       }
//     }
//   }, [location.pathname, isSuperAdminRoute, isSuperAdmin]);

//   useEffect(() => {
//     if (!isSuperAdminRoute && !isSuperAdmin) {
//       const handler = setTimeout(() => {
//         setDebouncedQuery(searchQuery);
//       }, 300);

//       return () => {
//         clearTimeout(handler);
//       };
//     }
//   }, [searchQuery, isSuperAdminRoute, isSuperAdmin]);

//   const handleSearchFocus = () => setIsSearchOpen(true);
//   const handleSearchChange = (e) => {
//     setSearchQuery(e.target.value);
//     if (e.target.value.length > 0 && !isSearchOpen) setIsSearchOpen(true);
//     if (e.target.value.length === 0) {
//       setIsSearchOpen(false);
//       setDebouncedQuery("");
//     }
//   };
//   const handleSearchClose = () => {
//     setIsSearchOpen(false);
//     setSearchQuery("");
//     setDebouncedQuery("");
//   };

//   const handleGlobalAdd = () => setIsAddMenuOpen(!isAddMenuOpen);
//   const handleAddMenuClose = () => {
//     setIsAddMenuOpen(false);
//     setHoveredMeeting(false);
//   };

//   const fetchFreshData = async () => {
//     setIsLoadingData(true);
//     try {
//       const [companiesRes, contactsRes] = await Promise.all([
//         API.get("/companies"),
//         API.get("/contacts"),
//       ]);
//       setCompanies(companiesRes.data);
//       setContacts(contactsRes.data);
//     } catch (err) {
//       console.error("Failed to fetch data:", err);
//     } finally {
//       setIsLoadingData(false);
//     }
//   };

//   const handleAddItem = async (type) => {
//     setIsAddMenuOpen(false);
//     setHoveredMeeting(false);

//     if (["contact", "deal", "task", "call-log"].includes(type)) {
//       await fetchFreshData();
//     }

//     switch (type) {
//       case "vendor":
//         setShowQuickVendorForm(true);
//         break;
//       case "company":
//         setShowQuickCompanyForm(true);
//         break;
//       case "contact":
//         setShowQuickContactForm(true);
//         break;
//       case "deal":
//         setShowQuickDealForm(true);
//         break;
//       case "task":
//         setShowQuickTaskForm(true);
//         break;
//       case "call-log":
//         setShowQuickCallLogForm(true);
//         break;
//       default:
//         break;
//     }
//   };

//   const handleMeetingType = (type) => {
//     setIsAddMenuOpen(false);
//     setHoveredMeeting(false);
//     setMeetingType(type);
//     setShowQuickMeetingForm(true);
//   };

//   const handleCompanyCreated = (newCompany) => {
//     setCompanies((prev) => [...prev, newCompany]);
//     setShowQuickCompanyForm(false);
//   };

//   const handleContactCreated = (newContact) => {
//     setContacts((prev) => [...prev, newContact]);
//     setShowQuickContactForm(false);
//   };

//   const handleVendorCreated = () => {
//     setShowQuickVendorForm(false);
//   };

//   const handleDealCreated = () => {
//     setShowQuickDealForm(false);
//   };

//   const handleTaskCreated = () => {
//     setShowQuickTaskForm(false);
//   };

//   const handleCallLogCreated = () => {
//     setShowQuickCallLogForm(false);
//   };

//   const handleMeetingCreated = () => {
//     setShowQuickMeetingForm(false);
//     setMeetingType("");
//   };

//   const addRecords = [
//     {
//       id: "company",
//       label: "Company",
//       icon: Building,
//       bgColor: "bg-blue-100",
//       iconColor: "text-blue-600",
//       hoverColor: "hover:bg-blue-50",
//     },
//     {
//       id: "contact",
//       label: "Contact",
//       icon: Users,
//       bgColor: "bg-pink-100",
//       iconColor: "text-pink-600",
//       hoverColor: "hover:bg-pink-50",
//     },
//     {
//       id: "deal",
//       label: "Deal",
//       icon: IndianRupeeIcon,
//       bgColor: "bg-teal-100",
//       iconColor: "text-teal-600",
//       hoverColor: "hover:bg-teal-50",
//     },
//     {
//       id: "vendor",
//       label: "Vendor",
//       icon: User,
//       bgColor: "bg-green-100",
//       iconColor: "text-green-600",
//       hoverColor: "hover:bg-green-50",
//     },
//   ];

//   const addActivities = [
//     {
//       id: "task",
//       label: "Task",
//       icon: CheckCircle,
//       bgColor: "bg-blue-100",
//       iconColor: "text-blue-600",
//       hoverColor: "hover:bg-blue-50",
//     },
//     {
//       id: "call-log",
//       label: "Call Log",
//       icon: Phone,
//       bgColor: "bg-purple-100",
//       iconColor: "text-purple-600",
//       hoverColor: "hover:bg-purple-50",
//     },
//   ];

//   const meetingTypes = [
//     {
//       id: "contact-meeting",
//       label: "Contact Meeting",
//       icon: Users,
//       bgColor: "bg-pink-100",
//       iconColor: "text-pink-600",
//       hoverColor: "hover:bg-pink-50",
//     },
//     {
//       id: "company-meeting",
//       label: "Company Meeting",
//       icon: Building,
//       bgColor: "bg-blue-100",
//       iconColor: "text-blue-600",
//       hoverColor: "hover:bg-blue-50",
//     },
//     {
//       id: "vendor-meeting",
//       label: "Vendor Meeting",
//       icon: User,
//       bgColor: "bg-yellow-100",
//       iconColor: "text-yellow-600",
//       hoverColor: "hover:bg-yellow-50",
//     },
//   ];

//   if (isSuperAdmin || isSuperAdminRoute) {
//     return (
//       <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm z-[9992] h-16" style={{ top: "var(--dc-offline-offset, 0px)" }}>
//         <div className="flex items-center justify-start h-full px-4 lg:pl-20">
//           {/* Branding Section */}
//           {isLoadingData ? (
//             <BrandingShimmer />
//           ) : (
//             <div
//               className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
//               onClick={() => {
//                 navigate(
//                   isSuperAdmin ? "/super-admin-overview" : "/settings/brand",
//                   {
//                     state: isSuperAdmin ? {} : { activeSection: "brand" },
//                   }
//                 );
//               }}
//             >
//               {renderCompanyLogo()}
//               <div
//                 className="font-semibold text-lg whitespace-nowrap font-sf"
//                 style={{ color: branding?.colors?.secondary }}
//               >
//                 {branding?.companyName || "Data Circles Admin"}
//               </div>
//             </div>
//           )}
//         </div>
//       </header>
//     );
//   }

//   return (
//     <>
//       <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm z-[9992] h-16">
//         <div className="flex items-center justify-end sm:justify-between h-full px-4 lg:pl-20">
//           {/* Branding Section */}
//           {isLoadingData ? (
//             <BrandingShimmer />
//           ) : (
//             <div
//               className="hidden sm:flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200 mr-4"
//               onClick={() => {
//                 navigate(
//                   isSuperAdmin ? "/super-admin-overview" : "/settings/brand",
//                   {
//                     state: isSuperAdmin ? {} : { activeSection: "brand" },
//                   }
//                 );
//               }}
//             >
//               {renderCompanyLogo()}
//               <div
//                 className="font-sf font-medium text-lg whitespace-nowrap"
//                 style={{ color: branding?.colors?.secondary }}
//               >
//                 {branding?.companyName || "Company"}
//               </div>
//             </div>
//           )}

//           {/* Search Bar */}
//           <div className="flex items-center gap-4">
//             {/* TRIAL BADGE */}
//             {(isTrialActive || (trialUsed && !isPaymentConfirmed)) && trialLeftLabel && (
//               <div
//                 onClick={() => navigate("/settings/subscription")}
//                 className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-300 hover:shadow-md hover:scale-105 animate-subtle-pulse"
//                 style={{
//                   borderColor: trialLeftLabel.includes("ended") ? "#ef4444" :
//                               trialLeftLabel.includes("day") && parseInt(trialLeftLabel) <= 2 ? "#f59e0b" : "#3b82f6",
//                   backgroundColor: trialLeftLabel.includes("ended") ? "#fef2f2" :
//                                   trialLeftLabel.includes("day") && parseInt(trialLeftLabel) <= 2 ? "#fffbeb" : "#eff6ff",
//                 }}
//               >
//                 <Clock
//                   className="h-4 w-4 animate-spin-slow"
//                   style={{
//                     color: trialLeftLabel.includes("ended") ? "#ef4444" :
//                           trialLeftLabel.includes("day") && parseInt(trialLeftLabel) <= 2 ? "#f59e0b" : "#3b82f6"
//                   }}
//                 />
//                 <span
//                   className="text-sm font-medium"
//                   style={{
//                     color: trialLeftLabel.includes("ended") ? "#ef4444" :
//                           trialLeftLabel.includes("day") && parseInt(trialLeftLabel) <= 2 ? "#f59e0b" : "#3b82f6"
//                   }}
//                 >
//                   {trialLeftLabel}
//                 </span>
//                 <ChevronRight className="h-3.5 w-3.5 opacity-50 transition-transform duration-300 group-hover:translate-x-1" />
//               </div>
//             )}

//             <div className="md:flex-1 w-[260px] md:w-[400px] max-w-md">
//               <div className="relative">
//                 <div className="absolute inset-y-0 left-8 sm:left-0 pl-3 flex items-center pointer-events-none">
//                   <Search className="h-4 w-4 text-gray-400" />
//                 </div>
//                 <input
//                   type="text"
//                   placeholder="Search companies, contacts, deals..."
//                   value={searchQuery}
//                   onChange={handleSearchChange}
//                   onFocus={handleSearchFocus}
//                   className="w-[90%] sm:w-full ml-8 sm:ml-0 pl-10 pr-4 py-2 border font-sf font-medium border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm placeholder-gray-500"
//                 />
//               </div>
//             </div>

//             {/* Global Add Button */}
//             <div>
//               <div className="relative group">
//                 <button
//                   onClick={handleGlobalAdd}
//                   className="font-sf flex items-center justify-center w-10 h-10 btn-primary rounded-lg transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer"
//                 >
//                   {isAddMenuOpen ? (
//                     <X className="h-5 w-5" />
//                   ) : (
//                     <PlusIcon className="w-4 h-4" />
//                   )}
//                 </button>

//                 {!isAddMenuOpen && (
//                   <span className="absolute right-[50px] top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-4 py-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
//                     Add Records or Activities
//                   </span>
//                 )}

//                 {isAddMenuOpen && (
//                   <>
//                     <div
//                       className="fixed inset-0 z-[9999]"
//                       onClick={handleAddMenuClose}
//                     />
//                     <div className="absolute right-[-35px] lg:right-0 top-[45px] mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-[10000] py-4 transition-all duration-300 ease-in-out">
//                       <div className="px-4 mb-4">
//                         <h3 className="text-sm font-semibold text-gray-700 mb-3">
//                           Add Records
//                         </h3>
//                         <div className="grid grid-cols-2 gap-2">
//                           {addRecords.map((item) => {
//                             const Icon = item.icon;
//                             return (
//                               <button
//                                 key={item.id}
//                                 onClick={() => handleAddItem(item.id)}
//                                 className={`flex items-center p-3 rounded-lg transition-colors duration-200 ${item.bgColor} ${item.hoverColor} cursor-pointer transform hover:scale-105`}
//                               >
//                                 <div
//                                   className={`w-8 h-8 rounded-lg ${item.bgColor} flex items-center justify-center mr-3`}
//                                 >
//                                   <Icon
//                                     className={`w-4 h-4 ${item.iconColor}`}
//                                   />
//                                 </div>
//                                 <span className="text-sm font-medium text-gray-700">
//                                   {item.label}
//                                 </span>
//                               </button>
//                             );
//                           })}
//                         </div>
//                       </div>

//                       <div className="border-t border-gray-200 my-4" />

//                       <div className="px-4">
//                         <h3 className="text-sm font-semibold text-gray-700 mb-3">
//                           Add Activities
//                         </h3>
//                         <div className="space-y-1">
//                           {addActivities.map((item) => {
//                             const Icon = item.icon;
//                             return (
//                               <div key={item.id} className="relative">
//                                 <button
//                                   onClick={() =>
//                                     item.id !== "meeting" &&
//                                     handleAddItem(item.id)
//                                   }
//                                   onMouseEnter={() =>
//                                     item.id === "meeting" &&
//                                     setHoveredMeeting(true)
//                                   }
//                                   onMouseLeave={() =>
//                                     item.id === "meeting" &&
//                                     setHoveredMeeting(false)
//                                   }
//                                   className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors duration-200 ${item.bgColor} ${item.hoverColor} cursor-pointer transform hover:scale-105`}
//                                 >
//                                   <div className="flex items-center">
//                                     <div
//                                       className={`w-8 h-8 rounded-lg ${item.bgColor} flex items-center justify-center mr-3`}
//                                     >
//                                       <Icon
//                                         className={`w-4 h-4 ${item.iconColor}`}
//                                       />
//                                     </div>
//                                     <span className="text-sm font-medium text-gray-700">
//                                       {item.label}
//                                     </span>
//                                   </div>
//                                   {item.id === "meeting" && (
//                                     <ChevronRight className="w-4 h-4 text-gray-400" />
//                                   )}
//                                 </button>

//                                 {item.id === "meeting" && hoveredMeeting && (
//                                   <div
//                                     className="absolute left-[50px] top-[60px] ml-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-[10001] transition-all duration-300 ease-in-out"
//                                     onMouseEnter={() => setHoveredMeeting(true)}
//                                     onMouseLeave={() =>
//                                       setHoveredMeeting(false)
//                                     }
//                                   >
//                                     <div className="px-2">
//                                       <h4 className="text-xs font-semibold text-gray-500 mb-2 px-3">
//                                         Meeting Type
//                                       </h4>
//                                       {meetingTypes.map((meetingType) => {
//                                         const MeetingIcon = meetingType.icon;
//                                         return (
//                                           <button
//                                             key={meetingType.id}
//                                             onClick={() =>
//                                               handleMeetingType(meetingType.id)
//                                             }
//                                             className={`w-full flex items-center p-3 rounded-lg transition-colors duration-200 ${meetingType.bgColor} ${meetingType.hoverColor} cursor-pointer transform hover:scale-105`}
//                                           >
//                                             <div
//                                               className={`w-7 h-7 rounded-lg ${meetingType.bgColor} flex items-center justify-center mr-3`}
//                                             >
//                                               <MeetingIcon
//                                                 className={`w-3.5 h-3.5 ${meetingType.iconColor}`}
//                                               />
//                                             </div>
//                                             <span className="text-sm font-medium text-gray-700">
//                                               {meetingType.label}
//                                             </span>
//                                           </button>
//                                         );
//                                       })}
//                                     </div>
//                                   </div>
//                                 )}
//                               </div>
//                             );
//                           })}
//                         </div>
//                       </div>
//                     </div>
//                   </>
//                 )}
//               </div>
//             </div>
//           </div>
//         </div>
//       </header>

//       {!isSuperAdmin && !isSuperAdminRoute && (
//         <>
//           {showQuickCompanyForm && (
//             <QuickCompanyForm
//               onCompanyCreated={handleCompanyCreated}
//               onRequestClose={() => setShowQuickCompanyForm(false)}
//             />
//           )}
//           {showQuickContactForm && (
//             <QuickContactForm
//               companies={companies}
//               onContactCreated={handleContactCreated}
//               onRequestClose={() => setShowQuickContactForm(false)}
//             />
//           )}
//           {showQuickVendorForm && (
//             <QuickVendorForm
//               onVendorCreated={handleVendorCreated}
//               onRequestClose={() => setShowQuickVendorForm(false)}
//             />
//           )}
//           {showQuickDealForm && (
//             <QuickDealForm
//               companies={companies}
//               contacts={contacts}
//               onDealCreated={handleDealCreated}
//               onRequestClose={() => setShowQuickDealForm(false)}
//             />
//           )}
//           {showQuickTaskForm && (
//             <QuickTaskForm
//               companies={companies}
//               contacts={contacts}
//               onTaskCreated={handleTaskCreated}
//               onRequestClose={() => setShowQuickTaskForm(false)}
//             />
//           )}
//           {showQuickCallLogForm && (
//             <QuickCallLogForm
//               contacts={contacts}
//               onCallLogCreated={handleCallLogCreated}
//               onRequestClose={() => setShowQuickCallLogForm(false)}
//             />
//           )}
//         </>
//       )}

//       <SearchResults
//         isOpen={
//           isSearchOpen &&
//           debouncedQuery.length > 0 &&
//           !isSuperAdmin &&
//           !isSuperAdminRoute
//         }
//         onClose={handleSearchClose}
//         searchQuery={debouncedQuery}
//       />
//     </>
//   );
// };

// export default Header;

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import dataCirclesLogo from "../assets/Datacircles logo.png";
import {
  Search,
  X,
  User,
  Building,
  Users,
  IndianRupeeIcon,
  CheckCircle,
  Phone,
  ChevronRight,
  Sparkles,
  Clock,
  Timer,
  HelpCircle,
  LayoutDashboard,
} from "lucide-react";
import SearchResults from "./SearchResults";
import QuickCompanyForm from "./company/QuickCompanyForm";
import QuickContactForm from "./contact/QuickContactForm";
import QuickVendorForm from "./vendor/QuickVendorForm";
import QuickDealForm from "./deal/QuickDealForm";
import QuickTaskForm from "./Task/QuickTaskForm";
import QuickCallLogForm from "./contact/QuickCallLogForm";
import API, { configureAxios } from "../services/api";
import { useAuth0 } from "@auth0/auth0-react";

import SearchIcon from "./common/SearchIcon";
import NotificationBell from "./NotificationBell";
import { DIM_CHROME_EVENT } from "../hooks/useSearchOverlayOpen";
// Shimmer UI Component for Branding
const BrandingShimmer = () => {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse"></div>
      <div className="h-5 w-24 bg-gray-200 animate-pulse rounded"></div>
    </div>
  );
};

const CRMIcon = ({ size = 20, style }) => (
  <svg width={size} height={size} viewBox="0 0 13 15" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
    <path d="M6.25 0L12.5 4.69542V14.0704H0V4.69542L6.25 0ZM7.8725 8.61063C8.31861 8.16521 8.54167 7.62438 8.54167 6.98813C8.54167 6.35174 8.31896 5.81056 7.87354 5.36458C7.42812 4.91847 6.88729 4.69542 6.25104 4.69542C5.61465 4.69542 5.07347 4.91813 4.6275 5.36354C4.18139 5.80896 3.95833 6.34979 3.95833 6.98604C3.95833 7.62243 4.18104 8.16361 4.62646 8.60958C5.07188 9.05569 5.61271 9.27875 6.24896 9.27875C6.88535 9.27875 7.42653 9.05604 7.8725 8.61063ZM5.51208 7.725C5.30958 7.52264 5.20833 7.27667 5.20833 6.98708C5.20833 6.6975 5.30958 6.45153 5.51208 6.24917C5.71444 6.04667 5.96042 5.94542 6.25 5.94542C6.53958 5.94542 6.78556 6.04667 6.98792 6.24917C7.19042 6.45153 7.29167 6.6975 7.29167 6.98708C7.29167 7.27667 7.19042 7.52264 6.98792 7.725C6.78556 7.9275 6.53958 8.02875 6.25 8.02875C5.96042 8.02875 5.71444 7.9275 5.51208 7.725ZM6.22854 11.7788C5.58799 11.7788 4.96479 11.8669 4.35896 12.0431C3.75313 12.2194 3.18049 12.4785 2.64104 12.8204H9.81896C9.28479 12.4785 8.71299 12.2194 8.10354 12.0431C7.49424 11.8669 6.86924 11.7788 6.22854 11.7788ZM1.25 5.32042V12.2756C1.96153 11.7126 2.74007 11.2806 3.58562 10.9798C4.43104 10.6791 5.31118 10.5288 6.22604 10.5288C7.15021 10.5288 8.03938 10.6778 8.89354 10.9758C9.74757 11.2739 10.5331 11.7044 11.25 12.2675V5.32042L6.25 1.57042L1.25 5.32042Z" fill={style?.color || "#1C1B1F"} />
  </svg>
);

const InvoicesIcon = ({ size = 20, style }) => (
  <svg width={size} height={size} viewBox="0 0 15 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
    <path d="M0 15.6408V0L1.15396 1.02562L2.33979 0L3.52563 1.02562L4.71146 0L5.8975 1.02562L7.08333 0L8.26917 1.02562L9.45521 0L10.641 1.02562L11.8269 0L13.0127 1.02562L14.1667 0V15.6408L13.0127 14.6152L11.8269 15.6408L10.641 14.6152L9.45521 15.6408L8.26917 14.6152L7.08333 15.6408L5.8975 14.6152L4.71146 15.6408L3.52563 14.6152L2.33979 15.6408L1.15396 14.6152L0 15.6408ZM2.29167 11.5223H11.875V10.2723H2.29167V11.5223ZM2.29167 8.44542H11.875V7.19542H2.29167V8.44542ZM2.29167 5.36854H11.875V4.11854H2.29167V5.36854ZM1.25 13.7371H12.9167V1.90375H1.25V13.7371Z" fill={style?.color || "#1C1B1F"} />
  </svg>
);

// Company glyph for the global Add menu. Sized via className (w-4 h-4) and
// coloured via currentColor so utility classes like text-black apply.
// These six glyphs (Company/Contact/Deal/Vendor/Task/CallLog) are each
// authored at a different native drawing scale (e.g. Contact's path spans
// ~16 units, Deal's ~22), which is invisible until they're rendered side by
// side at the same size — padding each one relative to only its OWN size
// (as the sidebar's own icons do) preserves the wrong thing: it keeps each
// icon's blank margin proportional to itself, not their sizes proportional
// to each other, so the smallest-drawn icon (Call Log) ended up reading as
// the biggest once rendered. All six therefore share one viewBox side
// (24.44 = the largest native dimension, Deal's 22, plus 10% margin), with
// each icon's own bounding box centered inside it — so a genuinely bigger
// piece of artwork actually renders bigger, and vice versa.
const CompanyAddIcon = ({ className, style }) => (
  <svg viewBox="-2.22 -3.22 24.44 24.44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <path d="M2 18C1.45 18 0.979167 17.8042 0.5875 17.4125C0.195833 17.0208 0 16.55 0 16V2C0 1.45 0.195833 0.979167 0.5875 0.5875C0.979167 0.195833 1.45 0 2 0H8C8.55 0 9.02083 0.195833 9.4125 0.5875C9.80417 0.979167 10 1.45 10 2V4H18C18.55 4 19.0208 4.19583 19.4125 4.5875C19.8042 4.97917 20 5.45 20 6V16C20 16.55 19.8042 17.0208 19.4125 17.4125C19.0208 17.8042 18.55 18 18 18H2ZM2 16H8V14H2V16ZM2 12H8V10H2V12ZM2 8H8V6H2V8ZM2 4H8V2H2V4ZM10 16H18V6H10V16ZM13 10C12.7167 10 12.4792 9.90417 12.2875 9.7125C12.0958 9.52083 12 9.28333 12 9C12 8.71667 12.0958 8.47917 12.2875 8.2875C12.4792 8.09583 12.7167 8 13 8H15C15.2833 8 15.5208 8.09583 15.7125 8.2875C15.9042 8.47917 16 8.71667 16 9C16 9.28333 15.9042 9.52083 15.7125 9.7125C15.5208 9.90417 15.2833 10 15 10H13ZM13 14C12.7167 14 12.4792 13.9042 12.2875 13.7125C12.0958 13.5208 12 13.2833 12 13C12 12.7167 12.0958 12.4792 12.2875 12.2875C12.4792 12.0958 12.7167 12 13 12H15C15.2833 12 15.5208 12.0958 15.7125 12.2875C15.9042 12.4792 16 12.7167 16 13C16 13.2833 15.9042 13.5208 15.7125 13.7125C15.5208 13.9042 15.2833 14 15 14H13Z" fill="currentColor" />
  </svg>
);

// Contact glyph for the global Add menu.
const ContactAddIcon = ({ className, style }) => (
  <svg viewBox="-4.22 -4.22 24.44 24.44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <path d="M5.175 6.825C4.39167 6.04167 4 5.1 4 4C4 2.9 4.39167 1.95833 5.175 1.175C5.95833 0.391667 6.9 0 8 0C9.1 0 10.0417 0.391667 10.825 1.175C11.6083 1.95833 12 2.9 12 4C12 5.1 11.6083 6.04167 10.825 6.825C10.0417 7.60833 9.1 8 8 8C6.9 8 5.95833 7.60833 5.175 6.825ZM0 14V13.2C0 12.6333 0.145833 12.1125 0.4375 11.6375C0.729167 11.1625 1.11667 10.8 1.6 10.55C2.63333 10.0333 3.68333 9.64583 4.75 9.3875C5.81667 9.12917 6.9 9 8 9C9.1 9 10.1833 9.12917 11.25 9.3875C12.3167 9.64583 13.3667 10.0333 14.4 10.55C14.8833 10.8 15.2708 11.1625 15.5625 11.6375C15.8542 12.1125 16 12.6333 16 13.2V14C16 14.55 15.8042 15.0208 15.4125 15.4125C15.0208 15.8042 14.55 16 14 16H2C1.45 16 0.979167 15.8042 0.5875 15.4125C0.195833 15.0208 0 14.55 0 14ZM2 14H14V13.2C14 13.0167 13.9542 12.85 13.8625 12.7C13.7708 12.55 13.65 12.4333 13.5 12.35C12.6 11.9 11.6917 11.5625 10.775 11.3375C9.85833 11.1125 8.93333 11 8 11C7.06667 11 6.14167 11.1125 5.225 11.3375C4.30833 11.5625 3.4 11.9 2.5 12.35C2.35 12.4333 2.22917 12.55 2.1375 12.7C2.04583 12.85 2 13.0167 2 13.2V14ZM9.4125 5.4125C9.80417 5.02083 10 4.55 10 4C10 3.45 9.80417 2.97917 9.4125 2.5875C9.02083 2.19583 8.55 2 8 2C7.45 2 6.97917 2.19583 6.5875 2.5875C6.19583 2.97917 6 3.45 6 4C6 4.55 6.19583 5.02083 6.5875 5.4125C6.97917 5.80417 7.45 6 8 6C8.55 6 9.02083 5.80417 9.4125 5.4125Z" fill="currentColor" />
  </svg>
);

// Deal glyph for the global Add menu.
const DealAddIcon = ({ className, style }) => (
  <svg viewBox="-1.22 -2.22 24.44 24.44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <path d="M10.8764 18C10.9431 18 11.0098 17.9833 11.0764 17.95C11.1431 17.9167 11.1931 17.8833 11.2264 17.85L19.4264 9.65C19.6264 9.45 19.7723 9.225 19.8639 8.975C19.9556 8.725 20.0014 8.475 20.0014 8.225C20.0014 7.95833 19.9556 7.70417 19.8639 7.4625C19.7723 7.22083 19.6264 7.00833 19.4264 6.825L15.1764 2.575C14.9931 2.375 14.7806 2.22917 14.5389 2.1375C14.2973 2.04583 14.0431 2 13.7764 2C13.5264 2 13.2764 2.04583 13.0264 2.1375C12.7764 2.22917 12.5514 2.375 12.3514 2.575L12.0764 2.85L13.9264 4.725C14.1764 4.95833 14.3598 5.225 14.4764 5.525C14.5931 5.825 14.6514 6.14167 14.6514 6.475C14.6514 7.175 14.4139 7.7625 13.9389 8.2375C13.4639 8.7125 12.8764 8.95 12.1764 8.95C11.8431 8.95 11.5223 8.89167 11.2139 8.775C10.9056 8.65833 10.6348 8.48333 10.4014 8.25L8.52643 6.4L4.15143 10.775C4.10143 10.825 4.06393 10.8792 4.03893 10.9375C4.01393 10.9958 4.00143 11.0583 4.00143 11.125C4.00143 11.2583 4.05143 11.3792 4.15143 11.4875C4.25143 11.5958 4.3681 11.65 4.50143 11.65C4.5681 11.65 4.63476 11.6333 4.70143 11.6C4.7681 11.5667 4.8181 11.5333 4.85143 11.5L7.55143 8.8C7.73476 8.61667 7.96393 8.52083 8.23893 8.5125C8.51393 8.50417 8.75143 8.6 8.95143 8.8C9.13476 8.98333 9.22643 9.21667 9.22643 9.5C9.22643 9.78333 9.13476 10.0167 8.95143 10.2L6.27643 12.9C6.22643 12.95 6.18893 13.0042 6.16393 13.0625C6.13893 13.1208 6.12643 13.1833 6.12643 13.25C6.12643 13.3833 6.17643 13.5 6.27643 13.6C6.37643 13.7 6.49309 13.75 6.62643 13.75C6.6931 13.75 6.75976 13.7333 6.82643 13.7C6.8931 13.6667 6.9431 13.6333 6.97643 13.6L9.67643 10.925C9.85976 10.7417 10.0889 10.6458 10.3639 10.6375C10.6389 10.6292 10.8764 10.725 11.0764 10.925C11.2598 11.1083 11.3514 11.3417 11.3514 11.625C11.3514 11.9083 11.2598 12.1417 11.0764 12.325L8.40143 15.025C8.35143 15.0583 8.31393 15.1083 8.28893 15.175C8.26393 15.2417 8.25143 15.3083 8.25143 15.375C8.25143 15.5083 8.30143 15.625 8.40143 15.725C8.50143 15.825 8.6181 15.875 8.75143 15.875C8.8181 15.875 8.8806 15.8625 8.93893 15.8375C8.99726 15.8125 9.05143 15.775 9.10143 15.725L11.8014 13.05C11.9848 12.8667 12.2139 12.7708 12.4889 12.7625C12.7639 12.7542 13.0014 12.85 13.2014 13.05C13.3848 13.2333 13.4764 13.4667 13.4764 13.75C13.4764 14.0333 13.3848 14.2667 13.2014 14.45L10.5014 17.15C10.4514 17.2 10.4139 17.2542 10.3889 17.3125C10.3639 17.3708 10.3514 17.4333 10.3514 17.5C10.3514 17.6333 10.4056 17.75 10.5139 17.85C10.6223 17.95 10.7431 18 10.8764 18ZM10.8514 20C10.2348 20 9.68893 19.7958 9.21393 19.3875C8.73893 18.9792 8.45976 18.4667 8.37643 17.85C7.80976 17.7667 7.33476 17.5333 6.95143 17.15C6.5681 16.7667 6.33476 16.2917 6.25143 15.725C5.68476 15.6417 5.21393 15.4042 4.83893 15.0125C4.46393 14.6208 4.23476 14.15 4.15143 13.6C3.5181 13.5167 3.00143 13.2417 2.60143 12.775C2.20143 12.3083 2.00143 11.7583 2.00143 11.125C2.00143 10.7917 2.06393 10.4708 2.18893 10.1625C2.31393 9.85417 2.4931 9.58333 2.72643 9.35L7.10143 4.975C7.48476 4.59167 7.9556 4.4 8.51393 4.4C9.07226 4.4 9.54309 4.59167 9.92643 4.975L11.8014 6.85C11.8348 6.9 11.8848 6.9375 11.9514 6.9625C12.0181 6.9875 12.0848 7 12.1514 7C12.3014 7 12.4264 6.95417 12.5264 6.8625C12.6264 6.77083 12.6764 6.65 12.6764 6.5C12.6764 6.43333 12.6639 6.36667 12.6389 6.3C12.6139 6.23333 12.5764 6.18333 12.5264 6.15L8.95143 2.575C8.7681 2.375 8.5556 2.22917 8.31393 2.1375C8.07226 2.04583 7.8181 2 7.55143 2C7.30143 2 7.05143 2.04583 6.80143 2.1375C6.55143 2.22917 6.32643 2.375 6.12643 2.575L2.60143 6.125C2.3681 6.35833 2.20143 6.63333 2.10143 6.95C2.00143 7.26667 1.97643 7.58333 2.02643 7.9C2.07643 8.18333 2.0181 8.43333 1.85143 8.65C1.68476 8.86667 1.45976 8.99167 1.17643 9.025C0.893095 9.05833 0.643095 8.99583 0.426429 8.8375C0.209762 8.67917 0.0847619 8.45833 0.0514286 8.175C-0.0485714 7.54167 -0.00273809 6.92083 0.188929 6.3125C0.380595 5.70417 0.709762 5.16667 1.17643 4.7L4.70143 1.175C5.10143 0.791667 5.54726 0.5 6.03893 0.3C6.5306 0.1 7.03476 0 7.55143 0C8.0681 0 8.57226 0.1 9.06393 0.3C9.5556 0.5 9.9931 0.791667 10.3764 1.175L10.6514 1.45L10.9264 1.175C11.3264 0.791667 11.7723 0.5 12.2639 0.3C12.7556 0.1 13.2598 0 13.7764 0C14.2931 0 14.7973 0.1 15.2889 0.3C15.7806 0.5 16.2181 0.791667 16.6014 1.175L20.8264 5.4C21.2098 5.78333 21.5014 6.225 21.7014 6.725C21.9014 7.225 22.0014 7.73333 22.0014 8.25C22.0014 8.76667 21.9014 9.27083 21.7014 9.7625C21.5014 10.2542 21.2098 10.6917 20.8264 11.075L12.6264 19.25C12.3931 19.4833 12.1223 19.6667 11.8139 19.8C11.5056 19.9333 11.1848 20 10.8514 20Z" fill="currentColor" />
  </svg>
);

// Vendor glyph for the global Add menu.
const VendorAddIcon = ({ className, style }) => (
  <svg viewBox="-2.72 -3.22 24.44 24.44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <path d="M2 16V2V6.475V6V16ZM5 10H8.525C8.80833 10 9.04583 9.90417 9.2375 9.7125C9.42917 9.52083 9.525 9.28333 9.525 9C9.525 8.71667 9.42917 8.47917 9.2375 8.2875C9.04583 8.09583 8.80833 8 8.525 8H5C4.71667 8 4.47917 8.09583 4.2875 8.2875C4.09583 8.47917 4 8.71667 4 9C4 9.28333 4.09583 9.52083 4.2875 9.7125C4.47917 9.90417 4.71667 10 5 10ZM5 14H8.525C8.80833 14 9.04583 13.9042 9.2375 13.7125C9.42917 13.5208 9.525 13.2833 9.525 13C9.525 12.7167 9.42917 12.4792 9.2375 12.2875C9.04583 12.0958 8.80833 12 8.525 12H5C4.71667 12 4.47917 12.0958 4.2875 12.2875C4.09583 12.4792 4 12.7167 4 13C4 13.2833 4.09583 13.5208 4.2875 13.7125C4.47917 13.9042 4.71667 14 5 14ZM5 6H13C13.2833 6 13.5208 5.90417 13.7125 5.7125C13.9042 5.52083 14 5.28333 14 5C14 4.71667 13.9042 4.47917 13.7125 4.2875C13.5208 4.09583 13.2833 4 13 4H5C4.71667 4 4.47917 4.09583 4.2875 4.2875C4.09583 4.47917 4 4.71667 4 5C4 5.28333 4.09583 5.52083 4.2875 5.7125C4.47917 5.90417 4.71667 6 5 6ZM2 18C1.45 18 0.979167 17.8042 0.5875 17.4125C0.195833 17.0208 0 16.55 0 16V2C0 1.45 0.195833 0.979167 0.5875 0.5875C0.979167 0.195833 1.45 0 2 0H16C16.55 0 17.0208 0.195833 17.4125 0.5875C17.8042 0.979167 18 1.45 18 2V6.45C18 6.73333 17.9042 6.97083 17.7125 7.1625C17.5208 7.35417 17.2833 7.45 17 7.45C16.7167 7.45 16.4792 7.35417 16.2875 7.1625C16.0958 6.97083 16 6.73333 16 6.45V2H2V16H6C6.28333 16 6.52083 16.0958 6.7125 16.2875C6.90417 16.4792 7 16.7167 7 17C7 17.2833 6.90417 17.5208 6.7125 17.7125C6.52083 17.9042 6.28333 18 6 18H2ZM12.225 12.275C11.7417 11.7917 11.5 11.2 11.5 10.5C11.5 9.8 11.7417 9.20833 12.225 8.725C12.7083 8.24167 13.3 8 14 8C14.7 8 15.2917 8.24167 15.775 8.725C16.2583 9.20833 16.5 9.8 16.5 10.5C16.5 11.2 16.2583 11.7917 15.775 12.275C15.2917 12.7583 14.7 13 14 13C13.3 13 12.7083 12.7583 12.225 12.275ZM14 14C14.65 14 15.2958 14.0625 15.9375 14.1875C16.5792 14.3125 17.2 14.5 17.8 14.75C18.1833 14.9 18.4792 15.1458 18.6875 15.4875C18.8958 15.8292 19 16.2 19 16.6V17C19 17.2833 18.9042 17.5208 18.7125 17.7125C18.5208 17.9042 18.2833 18 18 18H10C9.71667 18 9.47917 17.9042 9.2875 17.7125C9.09583 17.5208 9 17.2833 9 17V16.6C9 16.2 9.10417 15.8292 9.3125 15.4875C9.52083 15.1458 9.81667 14.9 10.2 14.75C10.8 14.5 11.4208 14.3125 12.0625 14.1875C12.7042 14.0625 13.35 14 14 14Z" fill="currentColor" />
  </svg>
);

// Task glyph for the global Add menu.
const TaskAddIcon = ({ className, style }) => (
  <svg viewBox="-2.72 -2.22 24.44 24.44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <path d="M14 17H12C11.7167 17 11.4792 16.9042 11.2875 16.7125C11.0958 16.5208 11 16.2833 11 16C11 15.7167 11.0958 15.4792 11.2875 15.2875C11.4792 15.0958 11.7167 15 12 15H14V13C14 12.7167 14.0958 12.4792 14.2875 12.2875C14.4792 12.0958 14.7167 12 15 12C15.2833 12 15.5208 12.0958 15.7125 12.2875C15.9042 12.4792 16 12.7167 16 13V15H18C18.2833 15 18.5208 15.0958 18.7125 15.2875C18.9042 15.4792 19 15.7167 19 16C19 16.2833 18.9042 16.5208 18.7125 16.7125C18.5208 16.9042 18.2833 17 18 17H16V19C16 19.2833 15.9042 19.5208 15.7125 19.7125C15.5208 19.9042 15.2833 20 15 20C14.7167 20 14.4792 19.9042 14.2875 19.7125C14.0958 19.5208 14 19.2833 14 19V17ZM2 18C1.45 18 0.979167 17.8042 0.5875 17.4125C0.195833 17.0208 0 16.55 0 16V4C0 3.45 0.195833 2.97917 0.5875 2.5875C0.979167 2.19583 1.45 2 2 2H3V1C3 0.716667 3.09583 0.479167 3.2875 0.2875C3.47917 0.0958333 3.71667 0 4 0C4.28333 0 4.52083 0.0958333 4.7125 0.2875C4.90417 0.479167 5 0.716667 5 1V2H11V1C11 0.716667 11.0958 0.479167 11.2875 0.2875C11.4792 0.0958333 11.7167 0 12 0C12.2833 0 12.5208 0.0958333 12.7125 0.2875C12.9042 0.479167 13 0.716667 13 1V2H14C14.55 2 15.0208 2.19583 15.4125 2.5875C15.8042 2.97917 16 3.45 16 4V9C16 9.28333 15.9042 9.52083 15.7125 9.7125C15.5208 9.90417 15.2833 10 15 10C14.7167 10 14.4792 9.90417 14.2875 9.7125C14.0958 9.52083 14 9.28333 14 9V8H2V16H8C8.28333 16 8.52083 16.0958 8.7125 16.2875C8.90417 16.4792 9 16.7167 9 17C9 17.2833 8.90417 17.5208 8.7125 17.7125C8.52083 17.9042 8.28333 18 8 18H2ZM2 6H14V4H2V6Z" fill="currentColor" />
  </svg>
);

// Call Log glyph for the global Add menu.
const CallLogAddIcon = ({ className, style }) => (
  <svg viewBox="-3.22 -3.22 24.44 24.44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <path d="M17 9C16.7333 9 16.4958 8.90417 16.2875 8.7125C16.0792 8.52083 15.9583 8.28333 15.925 8C15.7083 6.45 15.0542 5.12917 13.9625 4.0375C12.8708 2.94583 11.55 2.29167 10 2.075C9.71667 2.04167 9.47917 1.925 9.2875 1.725C9.09583 1.525 9 1.28333 9 1C9 0.716667 9.1 0.479167 9.3 0.2875C9.5 0.0958333 9.73333 0.0166667 10 0.05C12.1 0.283333 13.8917 1.14167 15.375 2.625C16.8583 4.10833 17.7167 5.9 17.95 8C17.9833 8.26667 17.9042 8.5 17.7125 8.7C17.5208 8.9 17.2833 9 17 9ZM12.825 9C12.6083 9 12.4167 8.925 12.25 8.775C12.0833 8.625 11.9583 8.425 11.875 8.175C11.7417 7.69167 11.4875 7.2625 11.1125 6.8875C10.7375 6.5125 10.3083 6.25833 9.825 6.125C9.575 6.04167 9.375 5.91667 9.225 5.75C9.075 5.58333 9 5.38333 9 5.15C9 4.81667 9.11667 4.54583 9.35 4.3375C9.58333 4.12917 9.84167 4.05833 10.125 4.125C11.0583 4.34167 11.8625 4.7875 12.5375 5.4625C13.2125 6.1375 13.6583 6.94167 13.875 7.875C13.9417 8.15833 13.8667 8.41667 13.65 8.65C13.4333 8.88333 13.1583 9 12.825 9ZM16.95 18C14.8667 18 12.8083 17.5458 10.775 16.6375C8.74167 15.7292 6.89167 14.4417 5.225 12.775C3.55833 11.1083 2.27083 9.25833 1.3625 7.225C0.454167 5.19167 0 3.13333 0 1.05C0 0.75 0.1 0.5 0.3 0.3C0.5 0.1 0.75 0 1.05 0H5.1C5.33333 0 5.54167 0.0791667 5.725 0.2375C5.90833 0.395833 6.01667 0.583333 6.05 0.8L6.7 4.3C6.73333 4.56667 6.725 4.79167 6.675 4.975C6.625 5.15833 6.53333 5.31667 6.4 5.45L3.975 7.9C4.30833 8.51667 4.70417 9.1125 5.1625 9.6875C5.62083 10.2625 6.125 10.8167 6.675 11.35C7.19167 11.8667 7.73333 12.3458 8.3 12.7875C8.86667 13.2292 9.46667 13.6333 10.1 14L12.45 11.65C12.6 11.5 12.7958 11.3875 13.0375 11.3125C13.2792 11.2375 13.5167 11.2167 13.75 11.25L17.2 11.95C17.4333 12.0167 17.625 12.1375 17.775 12.3125C17.925 12.4875 18 12.6833 18 12.9V16.95C18 17.25 17.9 17.5 17.7 17.7C17.5 17.9 17.25 18 16.95 18ZM3.025 6L4.675 4.35L4.25 2H2.025C2.10833 2.68333 2.225 3.35833 2.375 4.025C2.525 4.69167 2.74167 5.35 3.025 6ZM11.975 14.95C12.625 15.2333 13.2875 15.4583 13.9625 15.625C14.6375 15.7917 15.3167 15.9 16 15.95V13.75L13.65 13.275L11.975 14.95Z" fill="currentColor" />
  </svg>
);

const Header = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // The search bar slides from its normal navbar slot to the centre and opens
  // an attached results panel. searchOrigin captures where it started (via
  // getBoundingClientRect on the real slot, so it's exact for any screen
  // width) so the overlay can begin exactly on top of it and only then
  // transition to centred — a real slide, not a teleport.
  const searchSlotRef = useRef(null);
  const mobileSearchSlotRef = useRef(null);
  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchCentered, setSearchCentered] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [hoveredMeeting, setHoveredMeeting] = useState(false);
  const [showQuickCompanyForm, setShowQuickCompanyForm] = useState(false);
  const [showQuickContactForm, setShowQuickContactForm] = useState(false);
  const [showQuickVendorForm, setShowQuickVendorForm] = useState(false);
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [showQuickTaskForm, setShowQuickTaskForm] = useState(false);
  const [showQuickCallLogForm, setShowQuickCallLogForm] = useState(false);
  const [showQuickMeetingForm, setShowQuickMeetingForm] = useState(false);
  const [meetingType, setMeetingType] = useState("");
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [branding, setBranding] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { getAccessTokenSilently, user } = useAuth0();
  const isSuperAdmin = !!localStorage.getItem("superAdminToken");
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [trialEnd, setTrialEnd] = useState(null);
  const [trialLeftLabel, setTrialLeftLabel] = useState("");
  const [trialUsed, setTrialUsed] = useState(false);
  const [isPaymentConfirmed, setIsPaymentConfirmed] = useState(false);
  const [appStatus, setAppStatus] = useState(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(null);
  const [subscriptionLabel, setSubscriptionLabel] = useState("");

  const isSuperAdminRoute = location.pathname.startsWith("/super-admin");
  const [dynamicCrumbName, setDynamicCrumbName] = useState("");

  useEffect(() => {
    const companyMatch = location.pathname.match(/^\/companies\/([^/]+)$/);
    const contactMatch = location.pathname.match(/^\/contacts\/([^/]+)$/);
    const vendorMatch = location.pathname.match(/^\/vendors\/([^/]+)$/);
    const match = companyMatch || contactMatch || vendorMatch;
    if (!match) {
      setDynamicCrumbName("");
      return;
    }
    const entityId = match[1];
    const isContact = !!contactMatch;
    const isVendor = !!vendorMatch;
    // Vendors have no preloaded list in this header (unlike companies/
    // contacts), so they always fall through to the fetch below.
    const list = isContact ? contacts : isVendor ? [] : companies;
    const endpoint = isContact ? "contacts" : isVendor ? "vendors" : "companies";
    const cached = list.find((c) => c._id === entityId);
    if (cached) {
      setDynamicCrumbName(cached.name);
      return;
    }
    let cancelled = false;
    API.get(`/${endpoint}/${entityId}`)
      .then((res) => {
        if (!cancelled) setDynamicCrumbName(res.data?.name || "");
      })
      .catch(() => {
        if (!cancelled) setDynamicCrumbName("");
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, companies, contacts]);

  const ROUTE_LABELS = {
    "/": "Dashboard",
    "/companies": "Companies",
    "/deals": "Deals",
    "/contacts": "Contacts",
    "/vendors": "Vendors",
    "/products": "Products and Services",
    "/insights": "Insights",
    "/settings": "Settings",
    "/tasks": "Tasks and Meetings",
    "/calender": "Calendar",
    "/sales-return": "Sales Return",
    "/sales-subscription": "Subscription",
    "/e-invoicing": "E-Invoicing",
    "/purchase": "Purchases",
    "/purchase-order": "Purchase Orders",
    "/purchase-return": "Purchase Return",
    "/payments-timeline": "Timeline",
    "/journals": "Journals",
    "/expenses": "Expenses",
    "/indirect-income": "Indirect Income",
  };

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === "/" || path === "") return [{ label: "Dashboard", path: "/" }];
    const firstSegment = "/" + path.split("/").filter(Boolean)[0];
    const label = ROUTE_LABELS[firstSegment] || firstSegment.slice(1);
    const crumbs = [{ label, path: firstSegment }];
    if (dynamicCrumbName) crumbs.push({ label: dynamicCrumbName, path });
    return crumbs;
  };

  const getInitials = (name) => {
    if (!name || !name.trim()) return "?";
    const words = name.trim().split(" ");
    if (words.length === 1) {
      return words[0][0].toUpperCase();
    } else {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
  };

  const getRandomColor = (name) => {
    const colors = [
      "bg-red-500",
      "bg-green-500",
      "bg-blue-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-gray-500",
    ];
    if (!name) return colors[0];
    const charCode = name.charCodeAt(0);
    return colors[charCode % colors.length];
  };

  const renderCompanyLogo = () => {
    if (branding?.logoUrl) {
      // If logoUrl is a data URL, blob URL, or full HTTP URL, use it directly; otherwise prefix API URL
      const src =
        typeof branding.logoUrl === "string" &&
          (branding.logoUrl.startsWith("data:") ||
            branding.logoUrl.startsWith("blob:") ||
            branding.logoUrl.startsWith("http"))
          ? branding.logoUrl
          : `${import.meta.env.VITE_APP_API_URL}${branding.logoUrl}`;

      return (
        <img
          src={src}
          alt="Company Logo"
          className="h-9 w-9 rounded-full object-cover flex-shrink-0"
        />
      );
    } else {
      const src = `/DataCircles.png`;
      return (
        <img
          src={src}
          alt="Company Logo"
          className="h-9 w-9 rounded-md object-cover flex-shrink-0 drop-shadow-lg"
          style={{
            filter: "invert(100%)",
          }}
        />
      );
    }
  };

  useEffect(() => {
    if (!isSuperAdmin && !isSuperAdminRoute) {
      configureAxios(getAccessTokenSilently);
      // Trial/subscription state came back once, at mount, from this call
      // alone — starting a trial or upgrading a plan (SubscriptionContext,
      // used by the Settings/Billing screens) refreshed only that context's
      // own state, never this one, so the header's trial pill stayed on
      // whatever it saw at page load until a full reload. Re-fetch on the
      // event SubscriptionContext now fires after every state-changing call.
      const fetchTrialState = async () => {
        try {
          const authRes = await API.get("/auth/me");
          setIsTrialActive(authRes.data.isTrialActive);
          setTrialEnd(authRes.data.trialEnd);
          setTrialUsed(authRes.data.trialUsed);
          setIsPaymentConfirmed(authRes.data.isPaymentConfirmed);
          setAppStatus(authRes.data.appStatus);
          setCurrentPeriodEnd(authRes.data.currentPeriodEnd);
        } catch (err) {
          console.error("Failed to refresh trial/subscription state:", err);
        }
      };
      window.addEventListener("dc:subscription-updated", fetchTrialState);

      const fetchData = async () => {
        setIsLoadingData(true);
        try {
          const [companiesRes, contactsRes, brandingRes, authRes] =
            await Promise.all([
              API.get("/companies"),
              API.get("/contacts"),
              API.get("/branding"),
              API.get("/auth/me"),
            ]);
          setCompanies(companiesRes.data);
          setContacts(contactsRes.data);
          setBranding(brandingRes.data);
          setIsTrialActive(authRes.data.isTrialActive);
          setTrialEnd(authRes.data.trialEnd);
          setTrialUsed(authRes.data.trialUsed);
          setIsPaymentConfirmed(authRes.data.isPaymentConfirmed);
          setAppStatus(authRes.data.appStatus);
          setCurrentPeriodEnd(authRes.data.currentPeriodEnd);
        } catch (err) {
          console.error("Failed to fetch data:", err);
        } finally {
          setIsLoadingData(false);
        }
      };
      fetchData();

      return () => window.removeEventListener("dc:subscription-updated", fetchTrialState);
    } else {
      setBranding({ companyName: "Data Circles Admin", logoUrl: null });
    }
  }, [isSuperAdmin, isSuperAdminRoute, getAccessTokenSilently]);

  useEffect(() => {
    // Show badge if trial is active OR trial ended without payment
    const shouldShowTrialBadge =
      isTrialActive || (trialUsed && !isPaymentConfirmed);

    if (!shouldShowTrialBadge || !trialEnd) {
      setTrialLeftLabel("");
      return;
    }

    const endTime = new Date(trialEnd).getTime();

    function updateLabel() {
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        setTrialLeftLabel("Trial ended");
        return;
      }

      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      if (days >= 1) {
        setTrialLeftLabel(`${days} Day${days > 1 ? "s" : ""} Left!`);
      } else {
        setTrialLeftLabel(
          `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
            2,
            "0",
          )}:${String(seconds).padStart(2, "0")} left`,
        );
      }
    }

    updateLabel();
    let interval = null;

    // Only run interval if trial is still active
    if (isTrialActive && trialEnd) {
      interval = setInterval(updateLabel, 1000);
    }

    return () => interval && clearInterval(interval);
  }, [isTrialActive, trialEnd, trialUsed, isPaymentConfirmed]);

  useEffect(() => {
    // Show billing period countdown for active paid subscribers only
    if (!currentPeriodEnd || isTrialActive || !isPaymentConfirmed) {
      setSubscriptionLabel("");
      return;
    }
    const diff = new Date(currentPeriodEnd).getTime() - Date.now();
    if (diff <= 0) { setSubscriptionLabel(""); return; }
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    setSubscriptionLabel(`${days} Day${days !== 1 ? "s" : ""} Left!`);
  }, [currentPeriodEnd, isTrialActive, isPaymentConfirmed]);

  useEffect(() => {
    if (!isSuperAdminRoute && !isSuperAdmin) {
      if (isSearchOpen) {
        handleSearchClose();
      }
      if (isAddMenuOpen) {
        handleAddMenuClose();
      }
    }
  }, [location.pathname, isSuperAdminRoute, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdminRoute && !isSuperAdmin) {
      const handler = setTimeout(() => {
        setDebouncedQuery(searchQuery);
      }, 300);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [searchQuery, isSuperAdminRoute, isSuperAdmin]);

  // Desktop and mobile each have their own search field in different spots
  // in the layout (only one is ever actually visible at a given width), so
  // the slide needs to originate from whichever one was actually clicked.
  // Dispatched right here, synchronously with the state change that opens/
  // closes the overlay, rather than from a useEffect keyed on isSearchOpen.
  // An effect only runs after Header's own render commits, and the sidebar's
  // useSearchOverlayOpen() hook then needs a further render to react to the
  // event — two extra cycles the backdrop (which paints in this same render)
  // doesn't wait for, so the sidebar/footer dim visibly lagged behind it.
  // Firing from the handler collapses that gap to effectively nothing.
  const dispatchDimChrome = (open) => {
    window.dispatchEvent(new CustomEvent(DIM_CHROME_EVENT, { detail: { open } }));
  };

  const openSearchOverlay = (fromRef) => {
    const ref = fromRef || searchSlotRef;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setSearchOrigin({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
    setSearchCentered(false);
    setIsSearchOpen(true);
    dispatchDimChrome(true);
  };
  const handleSearchFocus = (fromRef) => openSearchOverlay(fromRef);
  const handleSearchChange = (e, fromRef) => {
    setSearchQuery(e.target.value);
    if (!isSearchOpen) openSearchOverlay(fromRef);
    // Backspacing to empty clears results but stays open on "Start typing to
    // search" — it shouldn't slide back to the navbar on its own. Only an
    // explicit close (X, backdrop click, Escape) does that.
    if (e.target.value.length === 0) setDebouncedQuery("");
  };
  const handleSearchClose = () => {
    setIsSearchOpen(false);
    setSearchCentered(false);
    setSearchQuery("");
    setDebouncedQuery("");
    dispatchDimChrome(false);
  };

  // Trigger the slide a tick after mount, once the overlay has painted at its
  // origin position — flipping searchCentered then lets the transition
  // classes below animate left/width/top to the centred target.
  useEffect(() => {
    if (!isSearchOpen || !searchOrigin) return;
    const id = requestAnimationFrame(() => setSearchCentered(true));
    return () => cancelAnimationFrame(id);
  }, [isSearchOpen, searchOrigin]);

  const handleGlobalAdd = () => setIsAddMenuOpen(!isAddMenuOpen);
  const handleAddMenuClose = () => {
    setIsAddMenuOpen(false);
    setHoveredMeeting(false);
  };

  const fetchFreshData = async () => {
    setIsLoadingData(true);
    try {
      const [companiesRes, contactsRes] = await Promise.all([
        API.get("/companies"),
        API.get("/contacts"),
      ]);
      setCompanies(companiesRes.data);
      setContacts(contactsRes.data);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleAddItem = (type) => {
    setIsAddMenuOpen(false);
    setHoveredMeeting(false);

    // Open the form immediately for a snappy response.
    switch (type) {
      case "vendor":
        setShowQuickVendorForm(true);
        break;
      case "company":
        setShowQuickCompanyForm(true);
        break;
      case "contact":
        setShowQuickContactForm(true);
        break;
      case "deal":
        setShowQuickDealForm(true);
        break;
      case "task":
        setShowQuickTaskForm(true);
        break;
      case "call-log":
        setShowQuickCallLogForm(true);
        break;
      default:
        break;
    }

    // Load the company/contact dropdown data in the background — the form
    // renders instantly and its selects populate once these resolve, instead
    // of the whole panel waiting on two network calls before appearing.
    if (["contact", "deal", "task", "call-log"].includes(type)) {
      fetchFreshData();
    }
  };

  const handleMeetingType = (type) => {
    setIsAddMenuOpen(false);
    setHoveredMeeting(false);
    setMeetingType(type);
    setShowQuickMeetingForm(true);
  };

  const handleCompanyCreated = (newCompany) => {
    setCompanies((prev) => [...prev, newCompany]);
    setShowQuickCompanyForm(false);
  };

  const handleContactCreated = (newContact) => {
    setContacts((prev) => [...prev, newContact]);
    setShowQuickContactForm(false);
  };

  const handleVendorCreated = () => {
    setShowQuickVendorForm(false);
  };

  const handleDealCreated = () => {
    setShowQuickDealForm(false);
  };

  const handleTaskCreated = () => {
    setShowQuickTaskForm(false);
  };

  const handleCallLogCreated = () => {
    setShowQuickCallLogForm(false);
  };

  const handleMeetingCreated = () => {
    setShowQuickMeetingForm(false);
    setMeetingType("");
  };

  const addRecords = [
    {
      id: "company",
      label: "Company",
      icon: CompanyAddIcon,
    },
    {
      id: "contact",
      label: "Contact",
      icon: ContactAddIcon,
    },
    {
      id: "deal",
      label: "Deal",
      icon: DealAddIcon,
    },
    {
      id: "vendor",
      label: "Vendor",
      icon: VendorAddIcon,
    },
  ];

  const addActivities = [
    {
      id: "task",
      label: "Task",
      icon: TaskAddIcon,
    },
    {
      id: "call-log",
      label: "Call Log",
      icon: CallLogAddIcon,
    },
  ];

  const meetingTypes = [
    {
      id: "contact-meeting",
      label: "Contact Meeting",
      icon: Users,
      bgColor: "bg-pink-100",
      iconColor: "text-pink-600",
      hoverColor: "hover:bg-pink-50",
    },
    {
      id: "company-meeting",
      label: "Company Meeting",
      icon: Building,
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600",
      hoverColor: "hover:bg-blue-50",
    },
    {
      id: "vendor-meeting",
      label: "Vendor Meeting",
      icon: User,
      bgColor: "bg-yellow-100",
      iconColor: "text-yellow-600",
      hoverColor: "hover:bg-yellow-50",
    },
  ];

  const isSelected = (id) => {
    switch (id) {
      case "company": return showQuickCompanyForm;
      case "contact": return showQuickContactForm;
      case "deal": return showQuickDealForm;
      case "vendor": return showQuickVendorForm;
      case "task": return showQuickTaskForm;
      case "call-log": return showQuickCallLogForm;
      default: return false;
    }
  };

  if (isSuperAdmin || isSuperAdminRoute) {
    return (
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm z-[9992] h-16">
        <div className="flex items-center justify-start h-full px-4 lg:pl-10">
          {/* Branding Section */}
          {isLoadingData ? (
            <BrandingShimmer />
          ) : (
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
              onClick={() => {
                navigate(
                  isSuperAdmin ? "/super-admin-overview" : "/settings/brand",
                  {
                    state: isSuperAdmin ? {} : { activeSection: "brand" },
                  },
                );
              }}
            >
              {renderCompanyLogo()}
              <div
                className="font-semibold text-lg whitespace-nowrap font-sf"
                style={{ color: branding?.colors?.secondary }}
              >
                {branding?.companyName || "Data Circles Admin"}
              </div>
            </div>
          )}
        </div>
      </header>
    );
  }

  return (
    <>
      <header
        className="hidden lg:flex fixed top-0 right-0 border-b border-gray-200 z-[9992] h-16 items-center justify-between px-4 sm:px-6 lg:px-8 transition-all duration-300 ease-in-out"
        // Same tint as the sidebar (Navbar.jsx CHROME_BG) - the two are one
        // continuous surface, joined by the curved corner.
        style={{ left: "var(--sidebar-width, 0px)", background: "var(--chrome-bg, #EBEDFF)", top: "var(--dc-offline-offset, 0px)" }}
      >
        <img
          src="/DC Logo Export.png"
          alt="DataCircles"
          className="h-9 w-auto object-contain"
        />

        {/* Right Section: Promo Buttons, Search & Actions */}
        <div className="flex items-center gap-2 lg:gap-4 ml-auto">
          {/* Promo Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {(() => {
              const label = trialLeftLabel || subscriptionLabel;
              if (!label) return null;
              const isEnded = label.includes("ended");
              const isUrgent = !isEnded && (
                (/day/i.test(label) && parseInt(label) <= 2) ||
                (subscriptionLabel && parseInt(subscriptionLabel) <= 3)
              );
              // The pill itself is neutral; urgency is carried by the label's
              // colour so the design stays intact when time is running out.
              const labelColor = isEnded
                ? "#ef4444"
                : isUrgent
                  ? "#B54708"
                  : "#525866";
              // Always "Upgrade Plan" — the subscription screen it opens covers
              // both upgrading and managing an existing plan.
              const buttonText = "Upgrade Plan";
              return (
                // 240px is the design width, but the label is dynamic ("7 Days
                // Left!" vs "26809 days left in plan"), so it's a minimum the
                // pill grows past rather than a cap that clips the text.
                <div className="box-border flex flex-row items-center justify-between gap-4 min-w-[240px] h-[42px] p-[10px] border border-[#E1E4EA] rounded-[96px]">
                  <div className="flex flex-row items-center gap-1 min-w-0">
                    <Timer className="w-5 h-5 flex-shrink-0 text-[#525866]" />
                    <span
                      className="flex items-center h-5 font-inter text-[14px] font-normal leading-[120%] tracking-[-0.5px] whitespace-nowrap"
                      style={{ color: labelColor }}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => navigate("/settings/subscription")}
                      className="box-border flex flex-row items-center justify-center gap-2 h-8 px-3 flex-shrink-0 rounded-full border border-[#0C4FCD] text-white font-inter text-[12px] leading-5 text-center whitespace-nowrap transition-opacity hover:opacity-90"
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 100%), var(--btn-primary)",
                        boxShadow:
                          "inset 0px 0px 0px 1.8px rgba(255, 255, 255, 0.25)",
                      }}
                    >
                      {buttonText}
                    </button>
                    {!isLoadingData && (
                      <button
                        className="box-border flex flex-row items-center justify-center gap-2 h-8 px-3 flex-shrink-0 rounded-full border border-[#0C4FCD] text-white font-inter text-[12px] leading-5 text-center whitespace-nowrap transition-opacity hover:opacity-90"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 100%), var(--btn-primary)",
                          boxShadow:
                            "inset 0px 0px 0px 1.8px rgba(255, 255, 255, 0.25)",
                        }}
                      >
                        Book a Call
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
          {/* Search — the slot below reserves the layout space (so nothing
              else in the navbar jumps) but is only ever visible when the
              overlay isn't open; the overlay is what's actually interactive
              once search is active. */}
          <div
            ref={searchSlotRef}
            className={`relative hidden lg:block w-[326px] h-[42px] transition-opacity duration-150 ${isSearchOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          >
            <SearchIcon className="absolute left-4 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
            <input
              type="text"
              placeholder="Search Companies, Deals, Contacts"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => handleSearchFocus()}
              // gray-300 rather than gray-200: the field sits on the header's
              // tinted chrome now, where the lighter border all but vanished.
              className="w-full h-full pl-11 pr-4 bg-white border border-gray-300 rounded-full text-sm text-gray-700 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-sans"
            />
          </div>

          {isSearchOpen && searchOrigin && (
            <>
              {/* Plain opaque dim — no blur. Sidebar/pagination dim themselves
                  independently via DIM_CHROME_EVENT; this is just the tint,
                  and also doubles as the click-outside-to-close target. */}
              <div
                className="fixed inset-0 z-[200000] bg-black/40"
                onClick={handleSearchClose}
              />
              {/* Starts pinned exactly over the real search slot (searchOrigin,
                  captured via getBoundingClientRect) and, once searchCentered
                  flips a tick later, transitions left/width/top to the centred
                  target — a real slide from where it was, not a jump-cut.
                  z-index above the backdrop (200000) — and above every
                  page-level portaled menu (row-actions/share/convert flyouts
                  go up to ~100051), the sidebar (9995) and the pagination bar
                  (9992), any of which could otherwise be left open under the
                  overlay and show through undimmed. */}
              <div
                className="fixed z-[200001] transition-all duration-300 ease-out"
                style={
                  searchCentered
                    ? { top: 10, left: "50%", width: 760, transform: "translateX(-50%)" }
                    : { top: searchOrigin.top, left: searchOrigin.left, width: searchOrigin.width, transform: "translateX(0)" }
                }
              >
                <div className="relative">
                  <SearchIcon className="absolute left-4 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866] z-10" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search Companies, Deals, Contacts"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="w-full h-[42px] pl-11 pr-11 bg-white border border-gray-200 rounded-full text-sm text-gray-700 placeholder:text-gray-500 outline-none ring-2 ring-blue-500 border-transparent font-sans shadow-lg"
                  />
                  {/* Clears the typed text only — the overlay itself stays
                      open (back to the collapsed "start typing" category
                      rows), same as backspacing it out by hand. Closing the
                      whole panel is still backdrop-click / Escape. */}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="absolute right-3.5 -translate-y-1/2 top-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  )}
                </div>

                {/* Attached results panel, docked directly under the bar. Sized
                    to its content (up to two-thirds of the viewport) rather
                    than always claiming a fixed height — a couple of matches
                    no longer leave a tall mostly-empty box underneath them.
                    This element does the scrolling itself (overflow-y-auto
                    with a real maxHeight) — SearchResults' own wrapper used to
                    be `h-full`, but percentage heights don't resolve against a
                    maxHeight-only ancestor, so it silently stopped scrolling
                    and results past the fold were just clipped instead. */}
                {/* Solid the instant it's mounted — no opacity fade. It used to
                    fade in with the bar's slide, but that meant it spent its
                    first ~200ms as a half-transparent grey wash with the page
                    content showing through, not a crisp white panel. */}
                <div
                  className="mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-y-auto"
                  style={{ maxHeight: "66vh" }}
                >
                  <SearchResults
                    variant="panel"
                    isOpen={isSearchOpen}
                    onClose={handleSearchClose}
                    searchQuery={debouncedQuery}
                  />
                </div>
              </div>
            </>
          )}

          <NotificationBell variant="desktop" />

          {/* New Button (Global Add) */}
          <div className="relative group">
            <button
              onClick={handleGlobalAdd}
              title="New"
              className="flex items-center justify-center w-9 h-9 bg-[#0085FF] hover:bg-blue-600 text-white rounded-full ring-4 ring-blue-200 transition-colors"
            >
              {isAddMenuOpen ? (
                <X className="w-4 h-4" strokeWidth={3} />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
            </button>

            {/* Redesigned Global Add Menu */}
            {isAddMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[9999] cursor-default"
                  onClick={handleAddMenuClose}
                />
                <div className="absolute right-0 top-12 w-[160px] bg-white rounded-xl shadow-2xl border border-gray-100 z-[10000] py-2 flex flex-col transition-all duration-300 ease-in-out">
                  {/* Content Area */}
                  <div className="flex-1 px-2">
                    {/* Add Records Section */}
                    <div className="mb-1">
                      <div className="space-y-0.5">
                        {addRecords.map((item) => {
                          const active = isSelected(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleAddItem(item.id)}
                              className={`w-full flex items-center p-1 rounded-lg transition-all group ${active
                                ? "bg-gradient-to-r from-[#D0E0FF] to-white"
                                : "hover:bg-[#F2F2F7]"
                                }`}
                            >
                              <div className="w-5 h-5 flex items-center justify-center mr-2.5 flex-shrink-0">
                                <item.icon className="w-[18px] h-[18px] text-black" />
                              </div>
                              <span className="text-sm font-medium text-gray-900 transition-all">
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-gray-200 my-1.5" />

                    {/* Add Activities Section */}
                    <div className="mb-1">
                      <div className="space-y-0.5">
                        {addActivities.map((item) => {
                          const active = isSelected(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleAddItem(item.id)}
                              className={`w-full flex items-center p-1 rounded-lg transition-all group ${active
                                ? "bg-gradient-to-r from-[#D0E0FF] to-white"
                                : "hover:bg-[#F2F2F7]"
                                }`}
                            >
                              <div className="w-5 h-5 flex items-center justify-center mr-2.5 flex-shrink-0">
                                <item.icon className="w-[18px] h-[18px] text-black" />
                              </div>
                              <span className="text-sm font-medium text-gray-900 transition-all">
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
              </>
            )}
          </div>

        </div>
      </header>

      {/* Mobile Header */}
      <header
        style={{ background: "var(--chrome-bg, #EBEDFF)", top: "var(--dc-offline-offset, 0px)" }}
        className="lg:hidden fixed top-0 left-0 right-0 z-[9992] h-[54px] flex items-center border-b border-[#ECECEC]"
      >
        <div className="w-full max-w-[440px] mx-auto flex items-center justify-between px-4 py-2 gap-3 h-full">
          {/* Logo — opens the sidebar on mobile */}
          <img
            src={dataCirclesLogo}
            alt="Logo"
            className="w-9 h-9 rounded-md object-cover flex-shrink-0 cursor-pointer"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("toggle-mobile-sidebar"))
            }
          />

          {/* Right cluster */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Search pill */}
            <div
              ref={mobileSearchSlotRef}
              className={`flex items-center gap-2 px-2.5 h-8 border border-[#E1E4EA] rounded-full flex-1 min-w-0 max-w-[172px] transition-opacity duration-150 ${isSearchOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            >
              <SearchIcon className="text-[#525866] flex-shrink-0 w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e, mobileSearchSlotRef)}
                onFocus={() => handleSearchFocus(mobileSearchSlotRef)}
                className="bg-transparent outline-none text-sm text-[#525866] placeholder:text-[#525866] w-full min-w-0"
              />
            </div>

            {/* Notification bell */}
            <NotificationBell variant="mobile" />

            {/* Add button */}
            <div className="relative flex-shrink-0">
              <button
                onClick={handleGlobalAdd}
                title="New"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0085FF] border border-[#0085FF]"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%), #0085FF",
                  boxShadow: "inset 0px 0px 0px 1.8px rgba(255,255,255,0.25)",
                }}
              >
                {isAddMenuOpen ? (
                  <X className="w-4 h-4 text-white" />
                ) : (
                  <PlusIcon className="w-4 h-4 text-white" />
                )}
              </button>

              {isAddMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[9999] cursor-default"
                    onClick={handleAddMenuClose}
                  />
                  <div className="absolute right-0 top-10 w-[min(150px,calc(100vw-32px))] max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-100 z-[10000] py-2.5 flex flex-col transition-all duration-300 ease-in-out">
                    <div className="flex-1 px-2.5">
                      <div className="mb-1.5">
                        <h3 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1.5">
                          Add Records
                        </h3>
                        <div className="space-y-0">
                          {addRecords.map((item) => {
                            const active = isSelected(item.id);
                            return (
                              <button
                                key={item.id}
                                onClick={() => handleAddItem(item.id)}
                                className={`w-full flex items-center p-1.5 rounded-lg transition-all group ${active
                                  ? "bg-gradient-to-r from-[#D0E0FF] to-white"
                                  : "hover:bg-[#F2F2F7]"
                                  }`}
                              >
                                <div className="w-6 h-6 flex items-center justify-center mr-1.5">
                                  <item.icon className="w-4 h-4 text-black" strokeWidth={1.5} />
                                </div>
                                <span className="text-xs font-medium text-gray-900 transition-all truncate">
                                  {item.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="border-t border-gray-50 my-1.5" />

                      <div className="mb-1.5">
                        <h3 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1.5">
                          Add Activities
                        </h3>
                        <div className="space-y-0">
                          {addActivities.map((item) => {
                            const active = isSelected(item.id);
                            return (
                              <button
                                key={item.id}
                                onClick={() => handleAddItem(item.id)}
                                className={`w-full flex items-center p-1.5 rounded-lg transition-all group ${active
                                  ? "bg-gradient-to-r from-[#D0E0FF] to-white"
                                  : "hover:bg-[#F2F2F7]"
                                  }`}
                              >
                                <div className="w-6 h-6 flex items-center justify-center mr-1.5">
                                  <item.icon className="w-4 h-4 text-black" strokeWidth={1.5} />
                                </div>
                                <span className="text-xs font-medium text-gray-900 transition-all truncate">
                                  {item.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Avatar */}
            <div className="flex items-center justify-center w-10 h-10 p-1 bg-white border border-[#E5E5E5] rounded-full flex-shrink-0">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-white font-medium text-sm ${getRandomColor(user?.name)}`}
                title={user?.name || ""}
              >
                {getInitials(user?.name)}
              </div>
            </div>
          </div>
        </div>
      </header>

      {!isSuperAdmin && !isSuperAdminRoute && (
        <>
          {showQuickCompanyForm && (
            <QuickCompanyForm
              onCompanyCreated={handleCompanyCreated}
              onRequestClose={() => setShowQuickCompanyForm(false)}
            />
          )}
          {showQuickContactForm && (
            <QuickContactForm
              companies={companies}
              onContactCreated={handleContactCreated}
              onRequestClose={() => setShowQuickContactForm(false)}
            />
          )}
          {showQuickVendorForm && (
            <QuickVendorForm
              onVendorCreated={handleVendorCreated}
              onRequestClose={() => setShowQuickVendorForm(false)}
            />
          )}
          {showQuickDealForm && (
            <QuickDealForm
              companies={companies}
              contacts={contacts}
              onDealCreated={handleDealCreated}
              onRequestClose={() => setShowQuickDealForm(false)}
            />
          )}
          {showQuickTaskForm && (
            <QuickTaskForm
              companies={companies}
              contacts={contacts}
              onTaskCreated={handleTaskCreated}
              onRequestClose={() => setShowQuickTaskForm(false)}
            />
          )}
          {showQuickCallLogForm && (
            <QuickCallLogForm
              contacts={contacts}
              onCallLogCreated={handleCallLogCreated}
              onRequestClose={() => setShowQuickCallLogForm(false)}
            />
          )}
        </>
      )}

    </>
  );
};

export default Header;
