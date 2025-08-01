# app.py (CLI version with targeted zipping)
import sys
import os
import json
import zipfile
from process_transcripts import process_transcripts
from firebase_utils import push_alerts_to_realtime_db

def main():
    if len(sys.argv) < 2:
        print("Usage: python app.py <file_path>")
        return

    file_path = sys.argv[1]
    print(f"Received file: {file_path}")

    try:
        # Process and get only generated files for this run
        output_dir, alerts, generated_files = process_transcripts(file_path)

        if alerts:
            push_alerts_to_realtime_db(os.path.basename(file_path), alerts)
            print("Alerts pushed to Firebase.")
        else:
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

    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()
