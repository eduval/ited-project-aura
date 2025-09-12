<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --------------------
// 1. Validate file
// --------------------
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Upload failed.",
        "files"   => $_FILES
    ]);
    exit;
}

if ($_FILES['file']['size'] > 20 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode([
        "success" => false,
        "error"   => "File too large. Maximum 20MB allowed."
    ]);
    exit;
}

// get extension
$ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));

// --------------------
// 2. Handle Word files (.doc / .docx) → Only save, no Python
// --------------------
if (in_array($ext, ['doc', 'docx'])) {
    if (!isset($_POST['type'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => 'Missing "type" for template']);
        exit;
    }

    $section = preg_replace('/[^a-z]/', '', strtolower($_POST['type']));
    $valid   = ['template','coursefailure','lowattendance','atriskstatus','lowtermaverage', 'alerttemplate'];

    if (!in_array($section, $valid, true)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid section key"]);
        exit;
    }

    $baseDir = __DIR__ . "/uploads/template/$section";
    if (!is_dir($baseDir) && !mkdir($baseDir, 0777, true)) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Failed creating upload directory"]);
        exit;
    }

    date_default_timezone_set('America/Vancouver');
    $timestamp    = time();
    $date         = date("Y_m_d");
    $safeOriginal = preg_replace('/[^A-Za-z0-9.-]/', '', $_FILES['file']['name']);
    $filename     = "{$date}{$timestamp}{$safeOriginal}";
    $targetFile   = $baseDir . "/" . $filename;

    if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetFile)) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Failed to move uploaded file."]);
        exit;
    }

    // public URL
    $protocol   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https://" : "http://";
    $host       = $_SERVER['HTTP_HOST'];
    $scriptPath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
    $publicBase = $protocol . $host . $scriptPath . "/uploads/template/$section";

    echo json_encode([
        "success"    => true,
        "kind"       => "template",
        "type"       => $section,
        "name"       => $_FILES['file']['name'],
        "url"        => "$publicBase/$filename",
        "size"       => filesize($targetFile),
        "uploadedAt" => $timestamp,
    ]);
    exit;
}

// --------------------
// 3. Handle Excel (.xlsx) → Save + run Python
// --------------------
if ($ext === 'xlsx') {
    $uploadDir = __DIR__ . "/uploads";
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    date_default_timezone_set('America/Vancouver');
    $timestamp   = time();
    $date        = date("Y_m_d");
    $finalName   = $date . "_" . $timestamp;
    $filenameOut = $finalName . ".xlsx";
    $targetFile  = $uploadDir . "/" . $filenameOut;

    if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetFile)) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Failed to move uploaded file."]);
        exit;
    }

    // call Python
    $escapedPath      = escapeshellarg($targetFile);
    $remoteIp         = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $escapedFinalName = escapeshellarg($finalName);
    $escapedIp        = escapeshellarg($remoteIp);
    $command          = "cd " . __DIR__ . " && python3 ../app.py $escapedPath $escapedFinalName $escapedIp";

    $descriptorspec = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"]
    ];
    $process = proc_open($command, $descriptorspec, $pipes, __DIR__);

    if (!is_resource($process)) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Failed to start Python process."]);
        exit;
    }

    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $returnCode = proc_close($process);
    $output     = $stdout . $stderr;

    if (strpos($output, 'ERROR_HEADER_VALIDATION::') !== false) {
        preg_match('/ERROR_HEADER_VALIDATION::(.+)/', $output, $matches);
        $errorMessage = $matches[1] ?? "Invalid file headers";
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Header validation failed",
            "details" => $errorMessage
        ]);
        exit;
    }

    if (trim($output) === '') {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error"   => "Python script returned no output.",
            "command" => $command
        ]);
        exit;
    }

    if ($returnCode !== 0) {
        error_log("Python error:\n$output");
    }

    $matches = [];
    $zipName = null;
    if (preg_match('/PROCESSED_FILE::([^\s]+)/', $output, $matches)) {
        $zipName = $matches[1];
    }

    echo json_encode([
        "success"      => $returnCode === 0,
        "output"       => trim($output),
        "exitCode"     => $returnCode,
        "processedZip" => $zipName
    ]);
    exit;
}

// --------------------
// 4. Unsupported file type
// --------------------
http_response_code(400);
echo json_encode([
    "success" => false,
    "error"   => "Unsupported file type. Only .doc, .docx, and .xlsx are allowed."
]);
exit;
?>