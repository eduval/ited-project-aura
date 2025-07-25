import requests

# Your Firebase Realtime Database URL
FIREBASE_DB_URL = "https://aura-cctb-testing-default-rtdb.firebaseio.com"

def push_alerts_to_realtime_db(file_name, alerts):
    print("⚠️ Using REST API to push alerts...")

    # ✅ Clean the file name for Firebase path: remove spaces and dots
    file_name = file_name.replace(".", "_").replace(" ", "_")

    # Convert alerts list to dictionary: alert_1, alert_2, ...
    alerts_dict = {f"alert_{i+1}": alert for i, alert in enumerate(alerts)}

    # Compose the full Firebase URL
    url = f"{FIREBASE_DB_URL}/alerts/{file_name}.json"

    try:
        # Send data using PUT request
        response = requests.put(url, json=alerts_dict)

        if response.status_code == 200:
            print("✅ Alerts pushed to Firebase successfully.")
        else:
            print(f"❌ Failed to push alerts: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Exception while pushing alerts: {e}")
