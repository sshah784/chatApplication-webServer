const WebSocket = require('ws');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK with service account credentials
const serviceAccount = require('./chatapp-firebase-adminsdk.json'); // Update the path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore(); // Initialize Firestore
const wss = new WebSocket.Server({ port: 8080 });
const clients = {}; // Store connected clients
const messagesQueue = {}; // Store messages for disconnected users

// Function to send notifications
const sendNotification = async (token, message) => {
    console.log(token,message,"sendNotification called");
    
    const payload = {
        notification: {
            title: message.senderId,
            body: message.text,
        },
       token:token
    };

    try {
        const response = await admin.messaging().send(payload);
        console.log(`Notification sent to ${message.recipientId}`, response);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};


wss.on('connection', (ws) => {
  let userId;

  ws.on('message', async (message) => {
    console.log(message, "received message");
    const parsedMessage = JSON.parse(message);
    console.log(parsedMessage, "parsedMessage");

    if (parsedMessage.type === 'register') {
      userId = parsedMessage.userId; // Register user
      clients[userId] = ws; // Store connection
      console.log(`${userId} connected`);
    } else if (parsedMessage.type === 'message') {
      const { recipientId, text } = parsedMessage;

      if (clients[recipientId]) {
        // User is online, send directly
        clients[recipientId].send(JSON.stringify({ senderId: userId, text }));
        console.log(`Message from ${userId} to ${recipientId}: ${text}`);
      } else {
        // User is offline, store the message and send notification
        const messageData = { senderId: userId, text };

        // Store the message for the recipient
        if (!messagesQueue[recipientId]) {
          messagesQueue[recipientId] = [];
        }
        messagesQueue[recipientId].push(messageData);

        // Fetch the user's FCM token from your database
        const fcmToken = await getFCMToken(recipientId);

        // Send notification
        sendNotification(fcmToken, messageData);
      }
    }
  });

  ws.on('close', () => {
    if (userId) {
      delete clients[userId]; // Remove user on disconnect
      console.log(`${userId} disconnected`);
    }
  });
});

// Function to get FCM token from your database
const getFCMToken = async (userId) => {
  try {
    const userDoc = await firestore.collection('users').doc(userId).get();
    return userDoc.exists ? userDoc.data().fcmToken : null;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null; // Return null if there's an error
  }
};

console.log('WebSocket server is running on ws://localhost:8080');
