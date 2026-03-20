import { h, useState, useEffect } from "../../assets/preact.esm.js";
import "./OfflineIndicator.css";
import BackendHealth from "../net/BackendHealth.js";

export default function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isBackendDown, setIsBackendDown] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        const poll = () => {
          try { setIsBackendDown(BackendHealth.shouldSkipNetwork()); } catch {}
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        const id = setInterval(poll, 3000);
        poll();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(id);
        };
    }, []);

    if (isOnline && !isBackendDown) {
        return null;
    }

    return (
        <div className="offline-indicator">offline readonly view</div>
    );
}
