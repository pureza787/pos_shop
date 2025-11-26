import { useState, useEffect, useRef } from 'react' // 👈 เพิ่ม useRef
import { db } from './firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import './Kitchen.css'

function Kitchen() {
  const [orders, setOrders] = useState([])
  
  // ใช้ไฟล์เสียงในเครื่อง (ต้องมีไฟล์ alert.wav ในโฟลเดอร์ public)
  const NOTIFICATION_SOUND = "/alert.wav"; 

  // 👇 สร้าง Audio Object เก็บไว้ใน Ref เพื่อให้โหลดแค่ครั้งเดียว
  const audioRef = useRef(null);

  // 👇 ฟังก์ชันเล่นเสียง (แยกออกมาเพื่อให้จัดการง่าย)
  const playSound = () => {
    try {
        if (audioRef.current) {
            // หยุดและตั้งเวลาเริ่มต้นใหม่ ก่อนเล่น (กันเสียงดีเลย์/ซ้อน)
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.log("Audio Error (Browser blocked):", e));
        }
    } catch (error) {
        console.error("Audio setup error:", error);
    }
  }

  useEffect(() => {
    // 1. โหลด Audio Object เมื่อ Component ถูก Mount
    if (audioRef.current === null) {
        audioRef.current = new Audio(NOTIFICATION_SOUND);
        // สามารถตั้งค่า volume ได้ที่นี่: audioRef.current.volume = 0.5;
    }

    // 2. ดึงออเดอร์ทั้งหมด
    const q = query(collection(db, "orders"), orderBy("timestamp", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        // ถ้ามีออเดอร์ "เพิ่มเข้ามาใหม่"
        if (change.type === "added") {
           // และสถานะยังไม่ใช่ cooked
           if (change.doc.data().status !== 'cooked') {
              playSound(); // 🔊 เรียกฟังก์ชันเล่นเสียง
           }
        }
      });

      // กรองเอาเฉพาะรายการที่ "ยังไม่เสร็จ" (status ไม่ใช่ cooked) มาแสดง
      const activeOrders = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(order => order.status !== 'cooked'); 

      setOrders(activeOrders);
    });

    return () => unsubscribe();
  }, [])

  // --- ฟังก์ชันกดเสร็จสิ้น ---
  const markAsDone = async (order) => {
    if (!confirm('ปรุงเสร็จแล้ว? (รายการจะหายไปจากหน้าครัว)')) return;

    try {
      await updateDoc(doc(db, "orders", order.id), {
        status: 'cooked' // แปะป้ายว่าเสร็จแล้ว
      });
    } catch (error) {
      console.error("Error:", error);
    }
  }

  return (
    <div className="kitchen-container">
      <div className="kitchen-header">
        <h1 className="kitchen-title">👨‍🍳 ครัว (รอทำ {orders.length} รายการ)</h1>
      </div>

      <div className="order-grid">
        {orders.length === 0 ? (
           <div className="empty-state-kitchen">ว่างครับ รอออเดอร์...</div>
        ) : orders.map((order) => (
          <div key={order.id} className="order-card status-active">
            <div className="card-header">
              <span className="table-no">โต๊ะ {order.table_no}</span>
              <div className="time-text">
                {order.timestamp?.seconds ? new Date(order.timestamp.seconds * 1000).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : ''}
              </div>
            </div>
            
            <ul className="order-items">
              {order.items.map((item, index) => (
                <li key={index} className="order-item">
                  {item.name} <span style={{color:'orange'}}>x{item.qty||1}</span>
                  {item.note && <div className="item-note">⚠️: {item.note}</div>}
                </li>
              ))}
            </ul>

            <div className="card-footer">
                <button onClick={() => markAsDone(order)} className="btn-done">
                  ✅ ปรุงเสร็จ
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Kitchen