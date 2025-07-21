import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useLocation, useNavigate } from "react-router-dom";
import { VALIDATE_OTP_ROUTE } from "@/utils/constants";
import { useAppStore } from "@/store";
import { REQUEST_OTP_ROUTE } from "@/utils/constants";

const OTPVerification = () => {
  const { state } = useLocation();
  const email = state?.email;
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();
  const { setOTPVerified } = useAppStore();

  const validateOtp = () => {
    if (!otp.length) {
      toast.error("OTP is required.");
      return false;
    }
    if (otp.length !== 6) {
      toast.error("OTP must be 6 digits.");
      return false;
    }
    if (!/^\d{6}$/.test(otp)) {
      toast.error("OTP should only contain numbers.");
      return false;
    }
    return true;
  };
  const handleResendOtp= async()=>{
    console.log("hello")
    const res = await apiClient.post(REQUEST_OTP_ROUTE, { email }, { withCredentials: true });
    if (res.status === 200) {
      toast.info("OTP resent succesfully")
      
      navigate("/verify-otp", { state: { email } });
    }
  };

  const handleOtpSubmit = async () => {
    if (validateOtp()) {
      try {
        if (!email) {
          toast.error("Email is missing. Please try again.");
          return;
        }

        const response = await apiClient.post(
          VALIDATE_OTP_ROUTE,
          { otp, email },
          { withCredentials: true }
        );
        if (response.status === 200) {
          toast.success("OTP verified successfully!");
          setOtp("");
          setOTPVerified(true);
          navigate("/profile");
        } else {
          toast.error("OTP verification failed. Please try again.");
        }
      } catch (error) {
        toast.error("An error occurred during OTP verification. Please try again.");
      }
    }
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-800 to-gray-700 flex items-center justify-center overflow-hidden">
      <div className="relative max-w-sm w-full bg-gray-300 p-8 shadow-xl rounded-lg">
        <div className="absolute inset-0 animate-move-light rounded-lg"></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold text-gray-800 text-center mb-6">
            OTP Verification
          </h2>
          <p className="text-sm text-gray-500 text-center mb-8">
            Enter the 6-digit OTP sent to your email address.
          </p>
          <div className="flex flex-col gap-4">
            <Input
              type="text"
              maxLength={6}
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="rounded-lg p-4 text-center text-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Button
              onClick={handleOtpSubmit}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition duration-300"
            >
              Verify OTP
            </Button>
          </div>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Didn’t receive the OTP?{" "}
              <span
                className="text-blue-600 cursor-pointer hover:underline"
                onClick={handleResendOtp}
              >
                Resend OTP
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OTPVerification;
