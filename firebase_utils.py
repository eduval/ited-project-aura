import requests

# Your Firebase Realtime Database URL
FIREBASE_DB_URL = "https://aura-cctb-testing-default-rtdb.firebaseio.com"


def fetch_thresholds():
    url = f"{FIREBASE_DB_URL}/settings.json"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            min_grade = data.get("min_grade", 40)
            print(min_grade)
            min_attendance = data.get("min_attendance", 60)
            print(min_attendance)
            print(f"Thresholds from Firebase: Grade= {min_grade}, Attendance= {min_attendance}")
            return min_grade, min_attendance
        else:
            print(f"Failed to fetch thresholds. Using defaults.")
            return 40, 60
    except Exception as e:
        print(f"Error fetching Firebase thresholds: {e}")
        return 40, 60


def push_alerts_to_realtime_db(file_name, alerts):
    print(" Using REST API to push alerts...")

    # ✅ Sanitize the file name for Firebase key usage
    file_name = file_name.replace(".", "_").replace(" ", "_")

    # ✅ Use real alert values, no hardcoding
    alerts_dict = {
        f"alert_{i+1}": {
            "issuedBy": alert.get("issuedBy", "system"),
            "message": alert.get("message", ""),
            "title": alert.get("title", "Alert"),
            "timestamp": alert.get("timestamp", ""),
            "studentId": alert.get("studentId", ""),
            "read": alert.get("read", False)
        }
        for i, alert in enumerate(alerts)
    }

    url = f"{FIREBASE_DB_URL}/Alerts_test/{file_name}.json"
    print(f"Firebase URL: {url}")

    try:
        response = requests.put(url, json=alerts_dict)
        print(" Firebase response:", response.text)

        if response.status_code == 200:
            print("Alerts pushed to Firebase successfully.")
        else:
            print(f" Failed to push alerts: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Exception while pushing alerts: {e}")
