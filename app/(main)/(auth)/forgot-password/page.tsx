"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Mail } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send reset email");
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-[#D1D8BE] shadow-lg">
      <CardHeader className="bg-gradient-to-r from-[#0E4B4B]/10 to-[#086666]/10 border-b border-[#D1D8BE]">
        <CardTitle className="text-2xl text-[#0D1414]">
          পাসওয়ার্ড রিসেট
        </CardTitle>
        <p className="text-sm text-[#2D4A3C]/70 mt-2">
          আপনার অ্যাকাউন্ট পুনরুদ্ধার করুন
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        {submitted ? (
          <div className="space-y-4">
            <div className="bg-[#A7C1A8]/10 border border-[#A7C1A8] rounded-lg p-4 flex gap-3">
              <CheckCircle className="w-5 h-5 text-[#0E4B4B] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-[#0E4B4B] mb-1">
                  চেক করুন আপনার ইমেইল
                </h3>
                <p className="text-sm text-[#2D4A3C]/80">
                  আমরা <strong>{email}</strong> এ একটি রিসেট লিঙ্ক পাঠিয়েছি।
                </p>
              </div>
            </div>

            <div className="bg-[#FFF3CD] border border-[#FFE69C] rounded-lg p-4 text-sm text-[#856404]">
              <p className="font-semibold mb-2">💡 টিপস:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>লিঙ্কটি 15 মিনিটের মধ্যে কার্যকর থাকবে</li>
                <li>স্প্যাম ফোল্ডার চেক করুন যদি ইমেইল না পান</li>
                <li>একটি নতুন শক্তিশালী পাসওয়ার্ড সেট করুন</li>
              </ul>
            </div>

            <Button
              onClick={() => {
                setSubmitted(false);
                setEmail("");
              }}
              className="w-full bg-[#C0704D] hover:bg-[#A85D3F] text-white rounded-lg"
            >
              অন্য ইমেইল চেষ্টা করুন
            </Button>

            <Link href="/signin">
              <Button variant="ghost" className="w-full text-white mt-2">
                সাইন ইনে ফিরে যান
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#0D1414] mb-2">
                ইমেইল ঠিকানা
              </label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#EEEFE0] border-[#D1D8BE] focus:border-[#819A91] text-[#0D1414]"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#0E4B4B] to-[#086666] hover:from-[#0A3A3A] hover:to-[#065252] text-white rounded-lg"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  পাঠানো হচ্ছে...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  রিসেট লিঙ্ক পাঠান
                </>
              )}
            </Button>

            <Link href="/signin">
              <Button variant="ghost" className="w-full mt-2 text-white">
                সাইন ইনে ফিরে যান
              </Button>
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
