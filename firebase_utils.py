import requests

FIREBASE_DB_URL = "https://aura-cctb-testing-default-rtdb.firebaseio.com"

def push_alerts_to_realtime_db(file_name, alerts):
    print("⚠️ Using REST API to push alerts...")
    file_name = file_name.replace(".", "_").replace(" ", "_")
    alerts_dict = {f"alert_{i+1}": alert for i, alert in enumerate(alerts)}
    url = f"{FIREBASE_DB_URL}/alerts/{file_name}.json"

    try:
        response = requests.put(url, json=alerts_dict)
        if response.status_code == 200:
            print("✅ Alerts pushed to Firebase successfully.")
        else:
            print(f"❌ Failed to push alerts: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Exception while pushing alerts: {e}")