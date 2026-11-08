import { isNativeApp } from "../../utils/isNativeApp";
import CalendarIcon from "../common/CalendarIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect } from "react";
import { ChevronDown, Clock, Users } from "lucide-react";
import API from "../../services/api";
import ContactMeetingForm from "./ContactMeetingForm";
import MeetingDetailsModal from "../company/MeetingDetailsModal";
import toast from "react-hot-toast";

const MeetingsTable = ({ contactId }) => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [contactName, setContactName] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch meetings
        const response = await API.get("/meetings", {
          params: { contactId },
        });
        setMeetings(response.data.meetings);

        // Fetch users for participants dropdown
        const usersResponse = await API.get("/auth/all-user");
        setUsers(usersResponse.data.allUsers);

        // Fetch contact details for name
        const contactResponse = await API.get(`/contacts/${contactId}`);
        setContactName(contactResponse.data.name || "");
      } catch (err) {
        setError("Failed to load meetings");
        console.error("Error fetching meetings:", err);
        toast.error(err.response?.data?.error || "Failed to load meetings.");
      } finally {
        setLoading(false);
      }
    };

    if (contactId) {
      fetchData();
    }
  }, [contactId]);

  const handleMeetingSave = async (meetingData) => {
    try {
      await API.post("/meetings", {
        ...meetingData,
        contactId,
        linkedTo: "contact",
      });
      // Refetch meetings
      const response = await API.get("/meetings", { params: { contactId } });
      setMeetings(response.data.meetings);
      toast.success("Meeting created!");
      setShowMeetingForm(false);
    } catch (err) {
      console.error("Error saving meeting:", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to create meeting.");
      }
      throw err;
    }
  };

  const handleMeetingDelete = async (meetingId) => {
    try {
      await API.delete(`/meetings/${meetingId}`);
      // Refetch meetings
      const response = await API.get("/meetings", { params: { contactId } });
      setMeetings(response.data.meetings);
      toast.success("Meeting deleted!");
      handleCloseMeetingModal();
    } catch (err) {
      console.error("Error deleting meeting:", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete meeting.");
      }
      throw err;
    }
  };

  const handleMeetingClick = (meeting) => {
    setSelectedMeeting(meeting);
    setIsMeetingModalOpen(true);
  };

  const handleCloseMeetingModal = () => {
    setIsMeetingModalOpen(false);
    setSelectedMeeting(null);
  };

  const formatDateTime = (isoDate) => {
    const date = new Date(isoDate);
    return {
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      scheduled: "bg-[#EEF2F9] text-[#56698A] border border-[#D6DEEC]",
      completed: "bg-gray-900 text-white",
      cancelled: "bg-[#EEF2F9] text-[#56698A] border border-[#D6DEEC]",
      "no-show": "bg-gray-300 text-gray-800",
    };
    return statusStyles[status] || "bg-gray-100 text-gray-800";
  };

  const getPriorityIndicator = (priority) => {
    if (priority === "high") {
      return (
        <div className="w-1 h-full bg-gray-900 rounded-l-lg absolute left-0 top-0"></div>
      );
    }
    return null;
  };

  const filteredMeetings = statusFilter
    ? meetings.filter((meeting) => meeting.status === statusFilter)
    : meetings;

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-gray-200 rounded w-24"></div>
          <div className="flex space-x-2">
            <div className="h-8 bg-gray-200 rounded w-20"></div>
            <div className="h-8 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-900 font-medium mb-2">
          Error Loading Meetings
        </div>
        <p className="text-gray-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarIcon className="w-4 h-4" />
          <span>{filteredMeetings.length} meetings</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`appearance-none bg-white border border-gray-300 ${isNativeApp ? "rounded-full" : "rounded-lg"} pl-3 pr-8 py-2 text-sm focus:outline-none focus:border-gray-400`}
            >
              <option value="">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no-show">No Show</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setShowMeetingForm(true)}
            className={`flex items-center gap-1 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 text-sm transition-colors ${isNativeApp ? "rounded-full px-4" : "rounded-lg"}`}
          >
            <PlusIcon className="w-4 h-4" />
            New Meeting
          </button>
        </div>
      </div>

      {/* Meetings List */}
      {filteredMeetings.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <CalendarIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-1">
            {statusFilter ? `No ${statusFilter} meetings` : "No meetings yet"}
          </p>
          <p className="text-xs text-gray-500">
            {statusFilter
              ? "Try changing the filter"
              : "Meetings will appear here once scheduled"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMeetings.map((meeting) => {
            const { date, time } = formatDateTime(meeting.scheduledAt);
            return (
              <div
                key={meeting._id}
                onClick={() => handleMeetingClick(meeting)}
                className="bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-all cursor-pointer group relative"
              >
                {/* Priority Indicator Line */}
                {getPriorityIndicator(meeting.priority)}

                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {meeting.title}
                    </h4>
                    {meeting.description && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                        {meeting.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded capitalize whitespace-nowrap ${getStatusBadge(
                      meeting.status
                    )}`}
                  >
                    {meeting.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      <span>{date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{time}</span>
                    </div>
                  </div>
                  {meeting.duration && (
                    <span className="text-gray-600">
                      {meeting.duration} min
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2 text-xs">
                  {meeting.meetingType && (
                    <span className="text-gray-500 capitalize">
                      {meeting.meetingType.replace("-", " ")}
                    </span>
                  )}
                  {meeting.priority && (
                    <span
                      className={`font-medium capitalize ${
                        meeting.priority === "high"
                          ? "text-gray-900"
                          : meeting.priority === "low"
                          ? "text-gray-500"
                          : "text-gray-600"
                      }`}
                    >
                      {meeting.priority} priority
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Stats */}
      {filteredMeetings.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-gray-600 text-xs font-medium mb-1">
              Scheduled
            </div>
            <div className="text-gray-900 text-xl font-bold">
              {meetings.filter((m) => m.status === "scheduled").length}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-gray-600 text-xs font-medium mb-1">
              Completed
            </div>
            <div className="text-gray-900 text-xl font-bold">
              {meetings.filter((m) => m.status === "completed").length}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-gray-600 text-xs font-medium mb-1">
              Cancelled
            </div>
            <div className="text-gray-900 text-xl font-bold">
              {meetings.filter((m) => m.status === "cancelled").length}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-gray-600 text-xs font-medium mb-1">
              No Show
            </div>
            <div className="text-gray-900 text-xl font-bold">
              {meetings.filter((m) => m.status === "no-show").length}
            </div>
          </div>
        </div>
      )}

      {/* ContactMeetingForm */}
      {showMeetingForm && (
        <ContactMeetingForm
          open={showMeetingForm}
          mode="create"
          contactId={contactId}
          onSave={handleMeetingSave}
          onDelete={handleMeetingDelete}
          onClose={() => setShowMeetingForm(false)}
        />
      )}

      {/* Meeting Details Modal */}
      {selectedMeeting && (
        <MeetingDetailsModal
          open={isMeetingModalOpen}
          meetingData={selectedMeeting}
          users={users}
          onDelete={handleMeetingDelete}
          onClose={handleCloseMeetingModal}
        />
      )}
    </div>
  );
};

export default MeetingsTable;
