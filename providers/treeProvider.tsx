"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";

// Define the context type
interface TreeContextType {
  selectedUser: string;
  setSelectedUser: React.Dispatch<React.SetStateAction<string>>;
}

// Create the context with a proper type or undefined as the default
const TreeContext = createContext<TreeContextType | undefined>(undefined);

interface TreeProviderProps {
  children: ReactNode;
}

const TreeProvider: React.FC<TreeProviderProps> = ({ children }) => {
  const [selectedUser, setSelectedUser] = useState<string>("");

  return (
    <TreeContext.Provider value={{ selectedUser, setSelectedUser }}>
      {children}
    </TreeContext.Provider>
  );
};

export default TreeProvider;

export const useSelectedUser = (): TreeContextType => {
  const context = useContext(TreeContext);
  if (!context) {
    throw new Error("useSelectedUser must be used within a TreeProvider");
  }
  return context;
};
