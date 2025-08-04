$(document).ready(function () {

    const lockScreen = $('#screen-lock');

    function lockUI() {
        $('#screen-lock').css('display', 'flex');  // show as flex
        $('#fileInput, #uploadBtn').prop('disabled', true);
    }

    function unlockUI() {
        $('#screen-lock').css('display', 'none');  // hide
        $('#fileInput, #uploadBtn').prop('disabled', false);
    }

    $('#uploadBtn').click(function () {
        const fileInput = $('#fileInput')[0];
        const file = fileInput.files[0];
        const status = $('#upload-status');
        const progress = $('.progress');
        const progressBar = $('#progressBar');
        const spinner = $('#processing-spinner');

        status.text('');
        spinner.hide();
        progress.hide();
        progressBar
            .removeClass('bg-success bg-danger bg-warning')
            .addClass('progress-bar-striped progress-bar-animated')
            .css('width', '0%')
            .text('0%');

        if (!file) {
            status.text("Please select a file first.");
            return;
        }

        const validTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (!validTypes.includes(file.type)) {
            status.text("Only Excel files (.xls, .xlsx) are allowed.");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        progress.show();
        lockUI();

        $.ajax({
            url: 'https://ited.org.ec/aura/excelfiles_upload/upload.php',
            type: 'POST',
            data: formData,
            contentType: false,
            processData: false,
            xhr: function () {
                const xhr = new window.XMLHttpRequest();

                xhr.upload.addEventListener("progress", function (evt) {
                    if (evt.lengthComputable) {
                        const percentComplete = Math.round((evt.loaded / evt.total) * 100);
                        progressBar.css('width', percentComplete + '%').text(percentComplete + '%');
                    }
                }, false);

                xhr.upload.addEventListener("load", function () {
                    // Upload done, now waiting for backend processing
                    progressBar
                        .addClass('bg-warning')
                        .text('Processing...')
                        .css('width', '100%');
                    spinner.show();
                });

                return xhr;
            },
            success: function (response) {
                spinner.hide();
                unlockUI();
                progressBar
                    .removeClass('bg-warning')
                    .removeClass('progress-bar-striped progress-bar-animated')
                    .addClass('bg-success')
                    .text('Done');
                fileInput.value = '';
                try {
                    const res = typeof response === 'string' ? JSON.parse(response) : response;
                    if (res.success) {
                        status.html(`<span class="text-success">✅ Upload and processing complete.<br>Processed: ${res.processedZip || 'N/A'}</span>`);
                    } else {
                        status.html(`<span class="text-danger">❌ Server Error: ${res.error || 'Unknown error.'}</span>`);
                    }
                } catch (e) {
                    status.html(`<span class="text-danger">❌ Unexpected response from server.</span>`);
                }
            },
            error: function (xhr, statusText, errorThrown) {
                spinner.hide();
                unlockUI();
                progressBar
                    .removeClass('progress-bar-animated progress-bar-striped')
                    .addClass('bg-danger')
                    .text('Failed');
                fileInput.value = '';
                status.html(
                    `<span class="text-danger">
            ❌ Upload failed: ${xhr.status} - ${xhr.statusText}<br>
            Server response: ${xhr.responseText || 'No response'}
          </span>`
                );
            }
        });
    });
});
