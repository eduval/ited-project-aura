# app.py (CLI version with targeted zipping)
import sys
import os
import json
import zipfile
from process_transcripts import process_transcripts
from firebase_utils import push_alerts_to_realtime_db

def log_debug(message):
    with open("debug_output.txt", "a", encoding="utf-8") as f:
        f.write(message + "\n")

def main():
    if len(sys.argv) < 2:
        log_debug(" Missing input argument")
        print("Usage: python app.py <file_path>")
        return

    file_path = sys.argv[1]
    log_debug(f"Received file: {file_path}")
    print(f"Received file: {file_path}")

    try:
        # Process and get only generated files for this run
        output_dir, alerts, generated_files = process_transcripts(file_path)

        if alerts:
            push_alerts_to_realtime_db(os.path.basename(file_path), alerts)
            log_debug("Alerts pushed to Firebase.")
            print("Alerts pushed to Firebase.")
        else:
            log_debug("No alerts to push.")
            print("No alerts generated.")

        # ✅ Zip only the current run’s outputs
        zip_file_name = "All_Transcripts.zip"
        zip_path = os.path.join(output_dir, zip_file_name)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file in generated_files:
                file_path = os.path.join(output_dir, file)
                if os.path.exists(file_path):
                    zipf.write(file_path, arcname=file)
        
        # ✅ Output ZIP file name for PHP to capture
        print(f"PROCESSED_FILE::{zip_file_name}")
        log_debug(f"Zipped and returned: PROCESSED_FILE::{zip_file_name}")

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        log_debug(" " + error_msg)
        print(error_msg)

if __name__ == "__main__":
    main()
