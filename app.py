from flask import Flask, request, jsonify
import os
from process_transcripts import process_transcripts
from firebase_utils import push_alerts_to_realtime_db

app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route("/upload", methods=["POST"])
def upload_excel():
    if "file" not in request.files:
        return jsonify({"error": "No file found in request"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not file.filename.endswith(".xlsx"):
        return jsonify({"error": "Only .xlsx files allowed"}), 400

    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)

    try:
        output_dir, alerts = process_transcripts(filepath)
        push_alerts_to_realtime_db(file.filename, alerts)

        return jsonify({
            "message": "File processed successfully.",
            "output_folder": output_dir,
            "alerts": alerts
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run()