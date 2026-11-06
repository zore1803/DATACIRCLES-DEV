import React from "react";
import API from "../../services/api";

const ProfilePicture = ({
  contact,
  size = "w-10 h-10",
  textSize = "text-sm",
}) => {
  const getRandomColor = (name) => {
    const colors = [
      "bg-red-500",
      "bg-green-500",
      "bg-blue-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
    ];
    const index = name ? name.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  const getInitials = (name) => {
    return (
      name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "?"
    );
  };

  if (contact?.avatar) {
    return (
      <img
        src={
          contact.avatar.startsWith("http") || contact.avatar.startsWith("data:")
            ? contact.avatar
            : `${import.meta.env.VITE_APP_API_URL}${contact.avatar}`
        }
        alt={contact.name}
        className={`${size} flex-shrink-0 aspect-square rounded-full object-cover border border-gray-200`}
      />
    );
  }

  return (
    <div
      className={`${size} flex-shrink-0 aspect-square rounded-full flex items-center justify-center text-white font-semibold ${textSize} ${getRandomColor(
        contact?.name
      )}`}
    >
      {getInitials(contact?.name)}
    </div>
  );
};

export default ProfilePicture;
