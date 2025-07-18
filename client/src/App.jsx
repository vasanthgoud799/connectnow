import React, { useEffect } from "react";
import Auth from "./components/Auth"
import Home from "./components/Home";
import { Navigate, Route,Routes } from "react-router-dom";
import Profile from "./components/Profile";
import { useAppStore } from "./store";
import { useState } from "react";
import { apiClient } from "./lib/api-client";
import { GET_USER_INFO } from "./utils/constants";
import { connectWithWebSocket } from "./utils/wssConnection/wssConnection";
import OTPVerification from "./components/OTPValidator";


const PrivateRoute=({children})=>{
  const {userInfo}=useAppStore();
  const isAuthenticated=!!userInfo;
  return isAuthenticated?children:<Navigate to="/auth" />;
}

const AuthRoute = ({ children }) => {
  const { userInfo } = useAppStore();
  const isAuthenticated = !!userInfo;
  return isAuthenticated ? <Navigate to="/home" /> : children;
};


function App() {
  useEffect(() => {
    connectWithWebSocket();
  },[]);
  const { userInfo, setUserInfo } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUserData = async () => {
      try {
        const response = await apiClient.get(GET_USER_INFO, { withCredentials: true });

        if (response.status === 200 && response.data.id) {
          setUserInfo(response.data);
        } else {
          setUserInfo(undefined);
        }
      } catch (error) {
        setUserInfo(undefined);
      } finally {
        setLoading(false);
      }
    };

    if (!userInfo) {
      getUserData();
    } else {
      setLoading(false);
    }
  }, [userInfo, setUserInfo]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/auth" element={
        <AuthRoute>
          <Auth />
        </AuthRoute>} 
      />
      <Route path="/home" element={
        <PrivateRoute>
          <Home />
        </PrivateRoute>} 
      />
      <Route path="/profile" element={
        <PrivateRoute>
          <Profile />
        </PrivateRoute>} 
      />
      <Route path="/verify-otp" element={
        <PrivateRoute>
          <OTPVerification/>
        </PrivateRoute>} 
      />
      <Route path="*" element={<Navigate to="/auth" />} />
    </Routes>
  );
}

export default App;
