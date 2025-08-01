<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_FILES["transcript"])) {
    $uploadDir = __DIR__ . "/uploads/";
    $outputDir = __DIR__ . "/transcripts_output/";

    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    $targetFile = $uploadDir . basename($_FILES["transcript"]["name"]);

    if (move_uploaded_file($_FILES["transcript"]["tmp_name"], $targetFile)) {
        $escapedPath = escapeshellarg($targetFile);

        // ✅ Run Python from the correct directory
        $command = "cd " . __DIR__ . " && python3 app.py $escapedPath 2>&1";
        $output = shell_exec($command);

        // ✅ Extract the processed filename
        $matches = [];
        preg_match('/PROCESSED_FILE::([^\s]+)/', $output, $matches);
        $processedFile = isset($matches[1]) ? trim($matches[1]) : null;

        if ($processedFile && file_exists($outputDir . $processedFile)) {
            echo json_encode([
                "status" => "success",
                "message" => "File processed successfully.",
                "filename" => $processedFile
            ]);
        } else {
            echo json_encode([
                "status" => "error",
                "message" => "Processed file not found: transcripts_output/$processedFile",
                "raw_output" => $output  // 👀 View this in browser console!
            ]);
        }

    } else {
        echo json_encode([
            "status" => "error",
            "message" => "Failed to upload file."
        ]);
    }
} else {
    echo json_encode([
        "status" => "error",
        "message" => "No file uploaded."
    ]);
}
?>
