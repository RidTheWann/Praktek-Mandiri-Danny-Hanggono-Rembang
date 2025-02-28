document.addEventListener("DOMContentLoaded", function () {
    const slides = document.querySelectorAll(".slide");
    const tabHeadersContainer = document.getElementById("tabHeaders");
    const sliderDotsContainer = document.getElementById("sliderDots");
    let currentIndex = 0;
    let autoSlideInterval;
    let isTransitioning = false;
    let transitionController = null;

    // Generate tab headers and dots
    slides.forEach((slide, index) => {
        const title = slide.querySelector(".card-title").textContent;

        const tabHeader = document.createElement("button");
        tabHeader.className = "tab-header";
        tabHeader.textContent = title;
        tabHeader.dataset.index = index;
        // KEMBALIKAN event listener ini:
        tabHeader.addEventListener("click", () => !isTransitioning && showSlide(index));
        tabHeadersContainer.appendChild(tabHeader);

        const dot = document.createElement("span");
        dot.className = "dot";
        dot.dataset.index = index;
        // KEMBALIKAN event listener ini:
        dot.addEventListener("click", () => !isTransitioning && showSlide(index));
        sliderDotsContainer.appendChild(dot);
    });

    // ... (fungsi showSlide, nextSlide, startAutoSlide - TIDAK BERUBAH) ...
    function showSlide(index) {
        if (isTransitioning) {
            cancelAnimationFrame(transitionController);
            slides.forEach(slide => {
                slide.style.transition = 'none';
                slide.classList.remove('active');
            });
        }

        isTransitioning = true;
        clearInterval(autoSlideInterval);

        const newIndex = index >= slides.length ? 0 : index < 0 ? slides.length - 1 : index;
        currentIndex = newIndex;

        // Reset transitions
        slides.forEach(slide => {
            slide.style.transition = '';
        });

        // Update slides
        slides.forEach((slide, i) => {
            slide.classList.toggle("active", i === currentIndex);
        });

        // Update indicators
        document.querySelectorAll(".tab-header, .dot").forEach(el => {
            el.classList.toggle("active", parseInt(el.dataset.index) === currentIndex);
        });

        // Transition end handler
        const completeTransition = () => {
            isTransitioning = false;
            startAutoSlide();
            slides[currentIndex].removeEventListener('transitionend', completeTransition);
        };

        slides[currentIndex].addEventListener('transitionend', completeTransition);

        // Fallback system
        transitionController = requestAnimationFrame(() => {
            if (isTransitioning) {
                slides[currentIndex].dispatchEvent(new Event('transitionend'));
            }
        });
    }

    function nextSlide() {
        if (!isTransitioning) {
            showSlide(currentIndex + 1);
        }
    }

    function startAutoSlide() {
        clearInterval(autoSlideInterval);
        autoSlideInterval = setInterval(nextSlide, 5000);
    }
    // Initial setup
    showSlide(0);

    // --- Hapus atau komentari kode ini ---
    // slides.forEach(slide => {
    //     slide.addEventListener("click", function() {
    //         if(!isTransitioning && this.classList.contains("active") && this.dataset.href) {
    //             window.location.href = this.dataset.href;
    //         }
    //     });
    // });
});