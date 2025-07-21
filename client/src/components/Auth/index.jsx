import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOGIN_ROUTE, SIGNUP_ROUTE } from "@/utils/constants";
import { apiClient } from "@/lib/api-client.js";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store";
import { connect } from "react-redux";
import { registerNewUser } from "@/utils/wssConnection/wssConnection";
import { setUsername } from "@/store/actions/dashboardActions";
import { setImageUrl } from "@/store/actions/dashboardActions";
import { setCallerImage } from "@/store/actions/callActions";
import { REQUEST_OTP_ROUTE } from "@/utils/constants";

function Auth({ saveUsername, saveImageUrl }) {
  const navigate = useNavigate();
  const { setUserInfo } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const isValidEmail = (email) => /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
      
  const validateSignUp = () => {
    if (!email.length) {
      toast.error("Email is required.");
      return false;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return false;
    }
    if (!password.length) {
      toast.error("Password is required");
      return false;
    }
    return true;
  };

  const validateLogin = () => {
    if (!email.length) {
      toast.error("Email is required.");
      return false;
    }
    if (!password.length) {
      toast.error("Password is required");
      return false;
    }
    return true;
  };

  const handleLogin = async () => {
    if (validateLogin()) {
      try {
        const response = await apiClient.post(LOGIN_ROUTE, { email, password }, { withCredentials: true });

        if (response.status === 200) {
          const user = response.data.user;
          setUserInfo(user); 
          const username = user.firstName;
          const imageUrl = user.image || "/default-avatar.png";
          console.log(user)
        
          registerNewUser(username);
          saveUsername(username);
          saveImageUrl(imageUrl);
          setCallerImage(imageUrl);
          setEmail("");
          setPassword("");
          if (!user.profileSetUp) {
            navigate("/profile");
          } else {
            navigate("/home");
          }
        }
      } catch (error) {
        toast.error("Login failed. Please try again.");
      }
    }
  };

  const handleSignUp = async () => {
    if (validateSignUp()) {
      if (!isValidEmail(email)) {
        toast.error("Please enter a valid email address.");
        return;
      }
      try {
        const response = await apiClient.post(SIGNUP_ROUTE, { email, password }, { withCredentials: true });
        if (response.status === 201) {
          setUserInfo(response.data.user); 
          navigate("/verify-otp", { state: { email } });
          const res = await apiClient.post(REQUEST_OTP_ROUTE, { email }, { withCredentials: true });
          if (res.status === 200) {
            toast.success("OTP sent successfully");
            
            navigate("/verify-otp", { state: { email } });
          }
        }
      } catch (error) {
        
        toast.error("Sign up failed. Please try again.");
      }
    }
  };
  

  return (
    <div className="h-[100vh] w-[100vw] bg-zinc-400 flex items-center justify-center">
      <div className="h-[80vh] bg-zinc-200 border-white shadow-3xl text-opacity-90 w-[80vw] md:w-[90vw] lg:w-[70vw] xl:w-[60vw] rounded-xl grid xl:grid-cols-2">
        <div className="flex flex-col gap-10 items-center justify-center">
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center justify-center">
              <h1 className="text-5xl font-bold  md:text-6xl">Welcome 😜</h1>
            </div>
            <br />
            <p className="font-medium text-center">
              Please login or register to start talking to your friends!
            </p>
          </div>
          <div className="flex items-center justify-center w-full">
            <Tabs className="w-3/4" defaultValue="login">
              <TabsList className="bg-transparent rounded-none w-full">
                <TabsTrigger
                  className="data-[state=active]:bg-transparent text-black text-opacity-90 border-b-2 rounded-none w-full data-[state=active]:text-black  data-[state=active]:font-semibold data-[state=active]:border-b-purple-500 p-3 transition-all duration-300"
                  value="login"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="data-[state=active]:bg-transparent text-black text-opacity-90 border-b-2 rounded-none w-full data-[state=active]:text-black  data-[state=active]:font-semibold data-[state=active]:border-b-purple-500 p-3 transition-all duration-300"
                >
                  SignUp
                </TabsTrigger>
              </TabsList>
              <TabsContent className="flex flex-col gap-4 mt-6" value="login">
                <Input
                  placeholder="Email"
                  type="email"
                  className="rounded-full p-6"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Input
                  placeholder="Password"
                  type="password"
                  className="rounded-full p-6"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button className="rounded-full p-6" onClick={handleLogin}>
                  Login
                </Button>
              </TabsContent>

              <TabsContent className="flex flex-col gap-4 mt-6" value="signup">
                <Input
                  placeholder="Email"
                  type="email"
                  className="rounded-full p-6"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Input
                  placeholder="Password"
                  type="password"
                  className="rounded-full p-6"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Input
                  placeholder="Confirm Password"
                  type="password"
                  className="rounded-full p-6"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Button className="rounded-full p-6" onClick={handleSignUp}>
                  SignUp
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <div className="hidden xl:flex pr-5 justify-center items-center">
          <img src="/Texting.gif" alt="Welcome" className="h-[550px]  rounded-xl" />
        </div>
      </div>
    </div>
  );
}

const mapActionsToProps = (dispatch) => {
  return {
    saveUsername: (username) => dispatch(setUsername(username)),
    saveImageUrl: (imageUrl) => dispatch(setImageUrl(imageUrl)),
  };
};

export default connect(null, mapActionsToProps)(Auth);
