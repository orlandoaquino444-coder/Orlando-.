import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBtnzA8Uf5iomh_r9LRuymIVs6zE7_DCqg",
  authDomain: "profefacil-9318a.firebaseapp.com",
  projectId: "profefacil-9318a",
  storageBucket: "profefacil-9318a.firebasestorage.app",
  messagingSenderId: "830708638867",
  appId: "1:830708638867:web:9367c43be799372e185966",
  measurementId: "G-19V3G8BTJQ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
