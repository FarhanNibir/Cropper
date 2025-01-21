const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const canvas = document.getElementById('image-canvas');
        const cropButton = document.getElementById('crop-button');
        const output = document.getElementById('output');
        const ctx = canvas.getContext('2d');

        let image = new Image();
        let cropping = false;
        let startX, startY, endX, endY;

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.backgroundColor = '#e3e3e3';
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.backgroundColor = '';
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.backgroundColor = '';
            handleFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            handleFile(e.target.files[0]);
        });

        function handleFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                image.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        image.onload = () => {
            canvas.width = image.width;
            canvas.height = image.height;
            ctx.drawImage(image, 0, 0);
        };

        canvas.addEventListener('mousedown', (e) => {
            cropping = true;
            startX = e.offsetX;
            startY = e.offsetY;
        });

        canvas.addEventListener('mouseup', (e) => {
            cropping = false;
            endX = e.offsetX;
            endY = e.offsetY;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!cropping) return;
            ctx.drawImage(image, 0, 0);
            ctx.beginPath();
            ctx.rect(startX, startY, e.offsetX - startX, e.offsetY - startY);
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        cropButton.addEventListener('click', () => {
            if (startX == null || startY == null || endX == null || endY == null) {
                alert('Please select an area to crop!');
                return;
            }

            const width = endX - startX;
            const height = endY - startY;

            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = Math.abs(width);
            croppedCanvas.height = Math.abs(height);
            const croppedCtx = croppedCanvas.getContext('2d');
            croppedCtx.drawImage(
                canvas,
                startX, startY,
                width, height,
                0, 0,
                Math.abs(width), Math.abs(height)
            );

            const croppedImage = new Image();
            croppedImage.src = croppedCanvas.toDataURL();
            output.appendChild(croppedImage);

            startX = startY = endX = endY = null;
        });