"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  name: string;
  email: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: async () => false,
  signup: async () => false,
  logout: () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  // Check for existing user session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error("Failed to parse stored user:", error);
        localStorage.removeItem("user");
      }
    }
  }, []);

  // Login function
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // In a real app, you would call your API here
      // const response = await fetch("/api/auth/login", {...})

      // For demo purposes, we'll simulate a successful login
      // with any non-empty email/password
      if (email && password) {
        const userData: User = {
          id: "user_" + Math.random().toString(36).substr(2, 9),
          name: email.split("@")[0],
          email: email,
        };

        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));

        // Check if there's a redirect path stored
        const redirectPath = sessionStorage.getItem("redirectPath");
        if (redirectPath) {
          sessionStorage.removeItem("redirectPath");
          router.push(redirectPath);
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  };

  // Signup function
  const signup = async (
    name: string,
    email: string,
    password: string
  ): Promise<boolean> => {
    try {
      // In a real app, you would call your API here
      // const response = await fetch("/api/auth/signup", {...})

      // For demo purposes, we'll simulate a successful signup
      if (name && email && password) {
        const userData: User = {
          id: "user_" + Math.random().toString(36).substr(2, 9),
          name: name,
          email: email,
        };

        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));

        // Check if there's a redirect path stored
        const redirectPath = sessionStorage.getItem("redirectPath");
        if (redirectPath) {
          sessionStorage.removeItem("redirectPath");
          router.push(redirectPath);
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error("Signup failed:", error);
      return false;
    }
  };

  // Logout function
  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
    router.push("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
