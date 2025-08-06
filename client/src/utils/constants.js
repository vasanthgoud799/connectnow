export const HOST = import.meta.env.VITE_SERVER_URL;
export const AUTH_ROUTES = "api/auth";
export const SIGNUP_ROUTE = `${AUTH_ROUTES}/signUp`;
export const LOGIN_ROUTE = `${AUTH_ROUTES}/login`;
export const GET_USER_INFO = `${AUTH_ROUTES}/user-info`;
export const UPDATE_PROFILE_ROUTE = `${AUTH_ROUTES}/update-profile`;
export const VALIDATE_OTP_ROUTE = `${AUTH_ROUTES}/validate-otp`;
export const REQUEST_OTP_ROUTE = `${AUTH_ROUTES}/request-otp`;
export const LOGOUT_ROUTE = `${AUTH_ROUTES}/logout`;

export const CONTACTS_ROUTES = "api/contacts";
export const SEARCH_CONTACTS_ROUTES = `${CONTACTS_ROUTES}/search`;
export const ADD_FRIEND_ROUTE = `${CONTACTS_ROUTES}/addUser`;
// utils/constants.js
export const GET_USER_DETAILS_ROUTE = `${CONTACTS_ROUTES}/details`;
export const GET_LAST_MESSAGE_ROUTE = `${CONTACTS_ROUTES}/lastMessage`;

export const MESSAGES_ROUTES = "api/messages";
export const GET_ALL_MESSAGES_ROUTES = `${MESSAGES_ROUTES}/get-messages`;
export const UPLOAD_FILE_ROUTE = `${MESSAGES_ROUTES}/upload-file`;
export const VIDEO_CALL_ROUTE = `${MESSAGES_ROUTES}/video-call`;

export const DETAILS_ROUTES = "api/details";

export const DELETE_CHAT_ROUTE = `${DETAILS_ROUTES}/delete-chat`;
export const UNFRIEND_ROUTE = `${DETAILS_ROUTES}/unfriend`;
// export const BLOCK_USER_ROUTE = `${DETAILS_ROUTES}/block`;
export const BLOCK_USER_ROUTE = `${DETAILS_ROUTES}/block`;
export const UNBLOCK_USER_ROUTE = `${DETAILS_ROUTES}/unblock`;
