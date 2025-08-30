Here’s a professionally structured README for your chat application, following the engaging style and thorough sectioning from modern open-source projects:[1][2][3][4]

***

# Connect Now: Real-Time Chat & Video App

Connect Now is a feature-rich, full-stack chat application that brings seamless real-time messaging and peer-to-peer video calling to users. With a responsive modern UI, robust notification system, file sharing, automated event reminders, and strong privacy controls, it’s designed for vibrant conversations and personal connections.


🧑‍💻 **Test Account**
- Username: vasanthgoud79@gmail.com
- Password: 123456

## ✨ Platform Features

### 🚀 Core Chat & Video Functionalities

#### 💬 Real-Time Messaging
- Exchange messages instantly via Socket.IO for a responsive chat experience.[3][4]

#### 🎥 Peer-to-Peer Video Calling
- Initiate direct video chats using WebRTC for secure, high-quality live calls.[4]

#### 🧑 One-on-One & Group Chats
- Private conversations and group rooms for personalized or collaborative messaging.[3][4]

#### 📂 File Sharing
- Share images, documents, and other file types directly in chat threads.[2]

#### 🔔 Presence & Notifications
- Online status indicators and instant notifications on new messages or events.[4]

#### 🎂 Automated Birthday Wishes
- Uses node-schedule to automatically send birthday messages to users on their special day.[5]

### 🛡️ User Experience & Security

#### ⚡ Responsive UI
- Built with React and Tailwind CSS for sleek, mobile-friendly design.[3][4]

#### 🔒 Secure Data Storage
- All messages and files securely stored in MongoDB.

#### 📌 Message Persistence
- Chat history retention for ongoing conversations.

## 🧑‍💻 Technical Stack

| Layer       | Technology                    |
|-------------|------------------------------|
| Frontend    | React, Tailwind CSS          |
| Messaging   | Socket.IO                    |
| Video       | WebRTC                       |
| Backend     | Node.js, Express             |
| Storage     | MongoDB                      |
| Automation  | node-schedule                |

## ⚡ Getting Started

### Prerequisites
- Node.js & npm
- MongoDB instance

### Setup

1. **Clone the Repository**
    ```
    git clone https://github.com/vasanthgoud799/connectnow.git
    cd connectnow
    ```
2. **Install Dependencies**
    ```
    npm install
    ```
3. **Set Up Environment Variables**
    Create a `.env` file:
    ```
    MONGODB_URI=your_mongo_url
    JWT_SECRET=your_jwt_secret
    ```

4. **Start the Application**
    ```
    npm start
    ```

5. **Access Frontend**
    - Visit `http://localhost:3000`

### Automated Birthday Feature
- Add user birthday data to profiles; the app uses node-schedule for timely greetings.[5]

## 🚀 Future Enhancements

- **Voice Messaging:** Record and send audio clips
- **Advanced Group Features:** Custom roles and permissions
- **End-to-End Encryption:** For message privacy
- **Rich Media Previews:** Thumbnails for shared files
