// ========================================
// Police Modern School - Main JavaScript (Optimized)
// ========================================

document.addEventListener('DOMContentLoaded', function () {
    // 1. Initialize AOS (Animate On Scroll)
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: true,
            offset: 20,
            disable: window.innerWidth < 100
        });
    }

    initFAQ();
    initTestimonialCarousel();
    initGallerySlider();
    initLanguageSwitcher();
    initContactForm();
    initBlastEffect();

    // 3. Smooth Scroll Enhancement
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '#!') return;

            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const navbar = document.getElementById('navbar');
                const noticeBoard = document.getElementById('notice-board');
                let offset = (navbar ? navbar.offsetHeight : 0) + (noticeBoard ? noticeBoard.offsetHeight : 0) + 20;

                window.scrollTo({
                    top: target.offsetTop - offset,
                    behavior: 'smooth'
                });
            }
        });
    });
});

// ========================================
// FAQ Accordion
// ========================================
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        item.querySelector('.faq-question').addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(faq => faq.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    });
}

// ========================================
// Testimonial Carousel (Dynamic)
// ========================================
// ========================================
// Testimonial Carousel (Dynamic)
// ========================================
const testimonialsHindi = [
    { stars: 5, text: "बहुत ही अच्छा स्कूल है। शिक्षक बहुत मेहनती और बच्चों के प्रति समर्पित हैं।", author: "श्रीमती अनिता शर्मा", class: "3" },
    { stars: 5, text: "पी.ए.सी. कैंपस में होने के कारण सुरक्षा की कोई चिंता नहीं है।", author: "श्री राकेश वर्मा", class: "5" },
    { stars: 5, text: "शिक्षकों का व्यवहार बहुत अच्छा है। बच्चों को प्यार से पढ़ाया जाता है।", author: "श्रीमती प्रिया सिंह", class: "नर्सरी" },
    { stars: 5, text: "अनुशासन और शिक्षा का बेहतरीन तालमेल यहाँ देखने को मिलता है।", author: "श्री अजय गुप्त", class: "8" },
    { stars: 5, text: "स्कूल की सुविधाएं आधुनिक हैं और पढ़ाई का माहौल बहुत ही अनुकूल है।", author: "श्रीमती मधु यादव", class: "4" },
    { stars: 5, text: "मेरे बच्चे के आत्मविश्वास में यहाँ आने के बाद बहुत सुधार हुआ है।", author: "श्री राजेश मौर्या", class: "2" },
    { stars: 5, text: "प्रवेश प्रक्रिया बहुत ही स्पष्ट और सरल है। स्टाफ बहुत ही विनम्र है।", author: "श्रीमती सीमा सिंह", class: "1" },
    { stars: 5, text: "खेलकूद और पढ़ाई का यहाँ बहुत अच्छा संतुलन है।", author: "श्री पंकज कुमार", class: "6" },
    { stars: 5, text: "रायबरेली में गुणवत्तापूर्ण शिक्षा के लिए यह सबसे भरोसेमंद स्कूल है।", author: "श्री अमित श्रीवास्तव", class: "7" },
    { stars: 5, text: "बच्चों की सुरक्षा और पढ़ाई दोनों यहाँ लाजवाब है।", author: "श्रीमती रीता देवी", class: "3" },
    { stars: 5, text: "स्मार्ट क्लास और आधुनिक शिक्षण पद्धति से बच्चे जल्दी सीखते हैं।", author: "श्री विकास पाण्डेय", class: "4" },
    { stars: 5, text: "पीटीएम के माध्यम से हमें बच्चे की प्रगति की नियमित जानकारी मिलती है।", author: "श्रीमती सुनीता मौर्या", class: "2" },
    { stars: 5, text: "स्कूल का वातावरण बहुत ही सकारात्मक और प्रेरणादायक है।", author: "श्री संजय मिश्रा", class: "5" },
    { stars: 5, text: "अनुभवी शिक्षकों की टीम बच्चों के भविष्य को सही दिशा में संवार रही है।", author: "श्रीमती कविता त्रिपाठी", class: "1" },
    { stars: 5, text: "स्कूल की बस सेवा बहुत ही सुरक्षित और समय की पाबंद है।", author: "श्री धीरज यादव", class: "6" },
    { stars: 5, text: "यहाँ के संस्कार और शिक्षा दोनों ही काबिले तारीफ हैं।", author: "श्रीमती मंजू सिंह", class: "नर्सरी" },
    { stars: 5, text: "बच्चे यहाँ खुशी-खुशी स्कूल जाते हैं, जो पेरेंट्स के लिए सबसे बड़ी बात है।", author: "श्री रविंद्र सिंह", class: "3" },
    { stars: 5, text: "किफायती फीस में इतनी अच्छी और सुरक्षित शिक्षा मिलना मुश्किल है।", author: "श्रीमती दीपा गुप्ता", class: "2" },
    { stars: 5, text: "स्कूल की लाइब्रेरी और प्रयोगशालाएं बहुत ही व्यवस्थित हैं।", author: "श्री अनिल कुमार", class: "8" },
    { stars: 5, text: "हर बच्चे पर व्यक्तिगत ध्यान दिया जाता है, जो मुझे बहुत पसंद है।", author: "श्रीमती रचना शर्मा", class: "5" },
    { stars: 5, text: "पीएसी परिसर की शांति और हरियाली पढ़ाई के लिए बहुत अनुकूल है।", author: "श्री मनोज तिवारी", class: "4" },
    { stars: 5, text: "वार्षिक उत्सव और सांस्कृतिक प्रतियोगिताएं बहुत अच्छा मंच है।", author: "श्रीमती सुमन देवी", class: "7" },
    { stars: 5, text: "साफ-सफाई और हाइजीन का यहाँ विशेष ध्यान रखा जाता है।", author: "श्री राहुल वर्मा", class: "एलकेजी" },
    { stars: 5, text: "स्कूल का प्रबंधन बहुत ही सक्रिय और सहायक है। धन्यवाद मैनेजमेंट।", author: "श्रीमती नूतन सिंह", class: "6" },
    { stars: 5, text: "नैतिक मूल्यों और संस्कारों की शिक्षा यहाँ का सबसे मजबूत पक्ष है।", author: "श्री शिव कुमार", class: "1" },
    { stars: 5, text: "इंग्लिश स्पीकिंग और व्यक्तित्व विकास पर विशेष जोर दिया जाता है।", author: "श्रीमती प्रियंका राज", class: "3" },
    { stars: 5, text: "पुलिस कैंपस के अंदर वातावरण पूरी तरह से सुरक्षित है।", author: "श्री अशोक कुमार", class: "5" },
    { stars: 5, text: "डिजिटल लर्निंग ने पढ़ाई को बहुत ही रुचिकर बनाया है।", author: "श्रीमती सरिता यादव", class: "2" },
    { stars: 5, text: "शिक्षक बच्चों की समस्याओं को बहुत धैर्य से सुनते हैं।", author: "श्री ज्ञानेंद्र सिंह", class: "8" },
    { stars: 5, text: "मुझे गर्व है कि मेरा बच्चा इस गरिमापूर्ण संस्थान का हिस्सा है।", author: "श्रीमती रेखा मिश्रा", class: "4" }
];

const testimonialsEnglish = [
    { stars: 5, text: "An excellent school with dedicated teachers who truly care for every child.", author: "Mrs. Anita Sharma", class: "3" },
    { stars: 5, text: "Being inside the PAC campus, there is no safety concern at all.", author: "Mr. Rakesh Verma", class: "5" },
    { stars: 5, text: "Teachers are very friendly and teach with great patience and love.", author: "Mrs. Priya Singh", class: "Nursery" },
    { stars: 5, text: "A perfect blend of discipline and quality education is visible here.", author: "Mr. Ajay Gupta", class: "8" },
    { stars: 5, text: "Modern facilities and a very supportive learning environment for children.", author: "Mrs. Madhu Yadav", class: "4" },
    { stars: 5, text: "My child's confidence has improved tremendously since joining PMS.", author: "Mr. Rajesh Maurya", class: "2" },
    { stars: 5, text: "The admission process was very clear and the staff is very polite.", author: "Mrs. Seema Singh", class: "1" },
    { stars: 5, text: "A great balance between sports and studies is maintained here.", author: "Mr. Pankaj Kumar", class: "6" },
    { stars: 5, text: "The most trustworthy school in Raebareli for quality primary education.", author: "Mr. Amit Srivastava", class: "7" },
    { stars: 5, text: "Child safety and quality education — both are excellent here.", author: "Mrs. Rita Devi", class: "3" },
    { stars: 5, text: "Smart classes and modern teaching methods help children learn quickly.", author: "Mr. Vikas Pandey", class: "4" },
    { stars: 5, text: "Regular PTMs keep us updated about our child's progress.", author: "Mrs. Sunita Maurya", class: "2" },
    { stars: 5, text: "The school environment is very positive and motivating.", author: "Mr. Sanjay Mishra", class: "5" },
    { stars: 5, text: "Experienced teachers guide children in the right direction.", author: "Mrs. Kavita Tripathi", class: "1" },
    { stars: 5, text: "The school bus service is very safe and always on time.", author: "Mr. Dheeraj Yadav", class: "6" },
    { stars: 5, text: "Both moral values and quality education are commendable here.", author: "Mrs. Manju Singh", class: "Nursery" },
    { stars: 5, text: "Children go to school happily every day — that is the biggest achievement.", author: "Mr. Ravindra Singh", class: "3" },
    { stars: 5, text: "Getting such great and safe education at an affordable fee is rare.", author: "Mrs. Deepa Gupta", class: "2" },
    { stars: 5, text: "The school library and labs are very well organized.", author: "Mr. Anil Kumar", class: "8" },
    { stars: 5, text: "Individual attention to each child is something I really appreciate.", author: "Mrs. Rachna Sharma", class: "5" },
    { stars: 5, text: "The peaceful PAC campus greenery is very conducive to learning.", author: "Mr. Manoj Tiwari", class: "4" },
    { stars: 5, text: "Annual events and cultural fests bring out the best talents in children.", author: "Mrs. Suman Devi", class: "7" },
    { stars: 5, text: "Cleanliness and hygiene are given special attention here.", author: "Mr. Rahul Verma", class: "LKG" },
    { stars: 5, text: "The school management is very active and supportive. Thank you.", author: "Mrs. Nutan Singh", class: "6" },
    { stars: 5, text: "Teaching of moral values and ethics is the strongest aspect of PMS.", author: "Mr. Shiv Kumar", class: "1" },
    { stars: 5, text: "Special focus on English speaking and personality development is great.", author: "Mrs. Priyanka Raj", class: "3" },
    { stars: 5, text: "Inside the police campus, the atmosphere is completely safe for children.", author: "Mr. Ashok Kumar", class: "5" },
    { stars: 5, text: "Digital learning has made studying very interesting for my child.", author: "Mrs. Sarita Yadav", class: "2" },
    { stars: 5, text: "Teachers listen to children's problems patiently and solve them.", author: "Mr. Gyanendra Singh", class: "8" },
    { stars: 5, text: "I am proud that my child is part of this dignified institution.", author: "Mrs. Rekha Mishra", class: "4" }
];

const galleryData = [
    { src: "/assets/images/gallery/1.jpg", alt: "Best school campus in Raebareli - Police Modern School" },
    { src: "/assets/images/gallery/2.jpg", alt: "Students classroom activity at Police Modern School Raebareli" },
    { src: "/assets/images/gallery/3.jpg", alt: "Smart class facility at best school in Raebareli" },
    { src: "/assets/images/gallery/4.jpg", alt: "Sports and playground activity at Police Modern School" },
    { src: "/assets/images/gallery/5.jpg", alt: "Science laboratory at best school in Raebareli" },
    { src: "/assets/images/gallery/6.jpg", alt: "Cultural events at Police Modern School Raebareli" },
    { src: "/assets/images/gallery/7.jpg", alt: "Modern computer lab at PMS Raebareli" },
    { src: "/assets/images/gallery/8.jpg", alt: "Library and resource center at Police Modern School" },
    { src: "/assets/images/gallery/9.jpg", alt: "School building and entrance - Police Modern School" },
    { src: "/assets/images/gallery/10.jpg", alt: "Indoor activities at best primary school in Raebareli" },
    { src: "/assets/images/gallery/11.jpg", alt: "Morning assembly at Police Modern School Raebareli" },
    { src: "/assets/images/gallery/12.jpg", alt: "Educational tour and field trip activities" },
    { src: "/assets/images/gallery/13.jpg", alt: "Student achievements showcase - PMS Raebareli" },
    { src: "/assets/images/gallery/14.jpg", alt: "Creative arts and crafts by students" },
    { src: "/assets/images/gallery/15.jpg", alt: "Physical education and yoga sessions" },
    { src: "/assets/images/gallery/16.jpg", alt: "Parent-teacher meeting and collaboration" }
];

function initGallerySlider() {
    const slider = document.getElementById('slider');
    if (!slider) return;

    // Inject images
    slider.innerHTML = galleryData.map(img => `
        <img src="${img.src}" class="slide" loading="lazy" decoding="async" width="400" height="300" alt="${img.alt}">
    `).join('');

    const slides = slider.querySelectorAll('.slide');
    let currentIndex = 0;
    const total = slides.length;

    if (total === 0) return;

    // Remove skeleton
    const skeleton = document.getElementById('gallery-skeleton');
    if (skeleton) {
        skeleton.style.opacity = '0';
        setTimeout(() => skeleton.remove(), 500);
    }

    function updateSlider() {
        slides.forEach((slide, index) => {
            slide.className = 'slide';
            let relativePos = (index - currentIndex + total) % total;
            if (relativePos === 0) slide.classList.add('pos-1');
            else if (relativePos === 1) slide.classList.add('pos-2');
            else if (relativePos === 2) slide.classList.add('pos-3');
        });
    }

    function nextSlide() {
        currentIndex = (currentIndex + 1) % total;
        updateSlider();
    }

    // Auto loop
    setInterval(nextSlide, 3500);
    updateSlider();
}

function initTestimonialCarousel() {
    const container = document.querySelector('.testimonial-slides-container');
    const counterDisplay = document.querySelector('.carousel-counter');
    const prevBtn = document.querySelector('.testimonial-prev');
    const nextBtn = document.querySelector('.testimonial-next');

    if (!container) return;

    // Detect language
    const currentLang = document.documentElement.lang || 'hi';
    const activeData = currentLang === 'en' ? testimonialsEnglish : testimonialsHindi;
    const parentLabel = currentLang === 'en' ? 'Parent, Class' : 'अभिभावक, कक्षा';

    // Inject testimonials dynamically to reduce initial DOM size
    container.innerHTML = activeData.map((t, i) => `
        <div class="testimonial-slide ${i === 0 ? 'active' : ''}">
            <div class="testimonial-stars text-sm text-yellow-500">${'★'.repeat(t.stars)}</div>
            <p class="testimonial-text text-sm">"${t.text}"</p>
            <p class="testimonial-author text-sm font-bold">${t.author}</p>
            <p class="text-gray-500 text-xs">${parentLabel} ${t.class}</p>
        </div>
    `).join('');

    // Remove skeleton
    const skeleton = document.getElementById('testimonial-skeleton');
    if (skeleton) {
        skeleton.style.opacity = '0';
        setTimeout(() => skeleton.remove(), 500);
    }

    const slides = container.querySelectorAll('.testimonial-slide');
    let currentSlide = 0;
    let autoPlayInterval;

    function showSlide(index) {
        slides.forEach(slide => slide.classList.remove('active'));
        currentSlide = (index + slides.length) % slides.length;
        slides[currentSlide].classList.add('active');
        if (counterDisplay) counterDisplay.textContent = `${currentSlide + 1} / ${slides.length}`;
    }

    function startAutoPlay() {
        stopAutoPlay();
        autoPlayInterval = setInterval(() => showSlide(currentSlide + 1), 6000);
    }

    function stopAutoPlay() { clearInterval(autoPlayInterval); }

    if (prevBtn) prevBtn.addEventListener('click', () => { showSlide(currentSlide - 1); startAutoPlay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { showSlide(currentSlide + 1); startAutoPlay(); });

    showSlide(0);
    startAutoPlay();

    const carousel = document.querySelector('.testimonial-carousel');
    if (carousel) {
        carousel.addEventListener('mouseenter', stopAutoPlay);
        carousel.addEventListener('mouseleave', startAutoPlay);
    }
}

// ========================================
// Language Switcher Logic
// ========================================
function initLanguageSwitcher() {
    const langButtons = document.querySelectorAll('.lang-btn');
    langButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Language preference is session-only
        });
    });
}

// ========================================
// Contact Form Handler
// ========================================
function initContactForm() {
    const contactForm = document.getElementById('contact-form');
    if (!contactForm) return;

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        const currentLang = document.documentElement.lang || 'hi';

        const langStrings = {
            en: {
                sending: 'Sending...',
                success: 'Thank you! Your message has been sent successfully.',
                successAlt: 'Thank you! We will contact you soon.',
                error: 'Something went wrong. Please try again.',
                validName: 'Please enter your name.',
                validEmail: 'Please enter a valid email address.',
                validMessage: 'Please enter a message.'
            },
            hi: {
                sending: 'भेजा जा रहा है...',
                success: 'धन्यवाद! संदेश सफलतापूर्वक भेज दिया गया है।',
                successAlt: 'धन्यवाद! हम आपसे जल्द संपर्क करेंगे।',
                error: 'कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
                validName: 'कृपया अपना नाम दर्ज करें।',
                validEmail: 'कृपया एक वैध ईमेल पता दर्ज करें।',
                validMessage: 'कृपया संदेश दर्ज करें।'
            }
        };

        const strings = langStrings[currentLang] || langStrings.hi;

        const formData = new FormData(contactForm);
        const name = (formData.get('name') || '').trim();
        const email = (formData.get('email') || '').trim();
        const phone = (formData.get('phone') || '').trim();
        const message = (formData.get('message') || '').trim();

        // Client-side validation
        if (!name) {
            showNotification(strings.validName, 'error');
            contactForm.querySelector('[name="name"]').focus();
            return;
        }
        if (!email || !email.includes('@') || email.length < 3) {
            showNotification(strings.validEmail, 'error');
            contactForm.querySelector('[name="email"]').focus();
            return;
        }
        if (!message) {
            showNotification(strings.validMessage, 'error');
            contactForm.querySelector('[name="message"]').focus();
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = strings.sending;

        try {
            const contactData = {
                name,
                email,
                phone,
                message,
                createdAt: new Date().toISOString(),
                read: false
            };

            if (typeof firestoreHelper !== 'undefined') {
                const result = await firestoreHelper.addDocument('contacts', contactData);
                if (result.success) {
                    showNotification(strings.success, 'success');
                    contactForm.reset();
                } else { throw new Error(result.error); }
            } else {
                showNotification(strings.successAlt, 'success');
                contactForm.reset();
            }
        } catch (error) {
            showNotification(strings.error, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 15px 25px; background: ${type === 'success' ? '#10b981' : '#ef4444'}; color: white; border-radius: 8px; z-index: 10000; animation: slideInRight 0.3s ease;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => { notification.remove(); }, 3000);
}

// ========================================
// Blast Effect for Hero Badges
// ========================================
function initBlastEffect() {
    const badgeRight = document.getElementById('hero-badge-right');
    const badgeLeft = document.getElementById('hero-badge-left');
    const heroSection = document.getElementById('home');
    if (!badgeRight || !badgeLeft || !heroSection) return;

    function createParticles(badge) {
        const centerX = badge.offsetLeft + badge.offsetWidth / 2;
        const centerY = badge.offsetTop + badge.offsetHeight / 2;
        const colors = ['#EF4444', '#FFFFFF', '#F59E0B', '#3B82F6', '#10B981'];

        for (let i = 0; i < 150; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `position: absolute; width: 10px; height: 10px; background: ${colors[Math.floor(Math.random() * colors.length)]}; border-radius: 50%; left: ${centerX}px; top: ${centerY}px; pointer-events: none; z-index: 30;`;
            heroSection.appendChild(particle);

            particle.animate([
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(${(Math.random() - 0.5) * 600}px, ${(Math.random() - 0.5) * 600}px) scale(0)`, opacity: 0 }
            ], { duration: 1500, easing: 'ease-out' }).onfinish = () => particle.remove();
        }
    }

    function cycleBadge(current, next) {
        current.style.opacity = '1'; current.style.transform = 'scale(1)';
        setTimeout(() => {
            current.style.transform = 'scale(1.3)';
            setTimeout(() => {
                createParticles(current);
                current.style.opacity = '0'; current.style.transform = 'scale(0)';
                setTimeout(() => cycleBadge(next, current), 2000);
            }, 150);
        }, 1000);
    }
    cycleBadge(badgeRight, badgeLeft);
}

// ========================================
// NEWS TICKER HANDLER
// ========================================
async function loadNewsTicker() {
    // News ticker now depends solely on fetchAndCacheNotifications which is Firestore-driven
}

const fetchAndCacheNotifications = async () => {
    try {
        if (typeof firestoreHelper === 'undefined') return;
        const result = await firestoreHelper.getDocuments('notifications');
        if (result.success && result.data.length > 0) {
            const active = result.data.filter(n => n.status === 'active' || !n.status);
            const ticker = document.getElementById('news-ticker-content');
            if (ticker && active.length > 0) {
                ticker.innerHTML = active.map(n => `
                    <span class="news-item inline-block">
                        <i class="fas fa-bullhorn text-yellow-300 mr-2"></i>
                        ${n.message || n.text}
                    </span>`).join('');
            }
        }
    } catch (e) { }
};

window.addEventListener('firebase-loaded', fetchAndCacheNotifications, { once: true });
if (typeof firestoreHelper !== 'undefined') fetchAndCacheNotifications();
loadNewsTicker();

