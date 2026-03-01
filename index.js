// ==========================================
// SECTION 1: DOM ELEMENTS
// ==========================================
const contentArea = document.getElementById('dynamic-content-area');
const weightInput = document.getElementById('patient-weight');
const ageInput = document.getElementById('pasient-age');
const ageUnit = document.getElementById('age-unit');

// ==========================================
// SECTION 2: WETFLAG CALCULATOR LOGIC
// ==========================================
// This function handles the specific math for the WETFLAG table placeholders {{calc:key}}
const getWetflagResults = (weight, age, unit) => {
    let calcWeight = weight;
    let ageInYears = unit === 'years' ? age : age / 12;
    let ageInMonths = unit === 'months' ? age : age * 12;
    
    // 1. Estimate weight if manual input is empty but age is provided
    if (!calcWeight && age > 0) {
        if (unit === 'months' || ageInYears <= 1) {
            // 0-12 mnd: (0,5 x alder i mnd) + 4
            calcWeight = (0.5 * ageInMonths) + 4;
        } else if (ageInYears <= 5) {
            // 1-5 år: (2 x alder i år) + 8
            calcWeight = (2 * ageInYears) + 8;
        } else {
            // 6-12 år: (3 x alder i år) + 7
            calcWeight = (3 * ageInYears) + 7;
        }
    }

    // If we still have no weight (both inputs empty), return an empty object
    if (!calcWeight) return {};

    // Beregnet dose adrenalin og benzodiazepiner skal ikke overstige 10 mg, så vi setter en øvre grense for benzodiazepiner
    const adrenalinDose = 0.01 * calcWeight;
    const benzoDose = 0.3 * calcWeight;
    const finalAdrenalinDose = Math.min(adrenalinDose, 0.5); // Maks 0.5 mg for adrenalin
    const finalBenzoDose = Math.min(benzoDose, 10); // Maks 10 mg for benzodiazepiner 
    // 

    // Astmakalkulasjon
    let ventolinDose = 0;
    if (calcWeight > 0 && calcWeight < 25) {
        ventolinDose = "2.5 mg";   
    }
   else if (calcWeight >= 25) {
        ventolinDose = "5 mg";
    }
    else {
        ventolinDose = "<span style='opacity:0.5;'>Angi vekt/alder</span>";
    }
    let prednisolonDose = 0;
    let predMin = Math.min(1* calcWeight, 40);
    let predMax = Math.min(2* calcWeight, 40);
    let predDose = Math.round(predMin /2.5) * 2.5; // Runder til nærmeste 2.5 mg

    //HFNC kalkulasjon
    // For HFNC, anbefales det å starte med 2 L/kg/min, og øke etter behov. Vi kan vise et startpunkt basert på vekt.
    let hfncFlow = 0;
    if (calcWeight < 10){
        hfncFlow = 2 * calcWeight; // 2 L/kg/min
    } else{
        hfncFlow = 20 + ((calcWeight - 10) * 0.5); // Maks 20 L/min for større barn
    }


    // 2. Return the calculated HTML strings mapped to their {{calc:...}} keys
    return {
        weight: `<strong>${calcWeight.toFixed(1)} kg</strong>`,
        energy: `<strong>${(4 * calcWeight).toFixed(0)} J</strong>`,
        tube: ageInYears > 0 ? `<strong>${((ageInYears / 4) + 4).toFixed(1)} mm</strong>` : '<span style="opacity:0.5;">Se tabell</span>',
        fluid: `<strong>${(10 * calcWeight).toFixed(0)} ml</strong>`,
        epi: `<strong>${finalAdrenalinDose.toFixed(2)} mg</strong>` + (adrenalinDose > 0.5 ? ' <span style="color:#ff7675; font-size:0.85em;">(Maks dose nådd)</span>' : ' <span style="font-size:0.85em; opacity:0.8;">(0.01 mg/kg)</span>'),
        glucose: `<strong>${(2 * calcWeight).toFixed(0)} ml</strong>`,
        blood: `<strong>${(5 * calcWeight).toFixed(0)} - ${(15 * calcWeight).toFixed(0)} ml</strong>`,
        benzodiazepiner: `<strong>${finalBenzoDose.toFixed(1)} mg</strong>` + (benzoDose > 10 ? ' <span style="color:#ff7675; font-size:0.85em;">(Maks dose nådd)</span>' : ' <span style="font-size:0.85em; opacity:0.8;">(0.3 mg/kg)</span>'),  
        ventolin: `<strong>${ventolinDose}</strong>`,
        prednisolonMin: `<strong>${predMin.toFixed(1)} mg</strong>`, 
        prednisolonMax: `<strong>${predMax.toFixed(1)} mg</strong>`,
        prednisolonDose: `<strong>${predDose.toFixed(1)} mg</strong>` + (predDose >= 40 ? ' <span style="color:#ff7675; font-size:0.85em;">(Maks dose nådd)</span>' : ' <span style="font-size:0.85em; opacity:0.8;">(1-2 mg/kg)</span>'),
        hfnc: `<strong>${hfncFlow.toFixed(1)} L/min </strong> <span style="font-size:0.85em; opacity:0.8;">(2 L/kg til 10kg, deretter 0.5 L/kg)</span>`,
    };
    
   
};

// ==========================================
// SECTION 3: MARKDOWN LOADER & PARSER
// ==========================================
const loadMarkdown = async (button) => {
    const fileName = button.getAttribute('data-file');
    if (!fileName) return;

    // UI: Set active button state
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    try {
        // Fetch file
        const response = await fetch(`./topics/${fileName}`);
        if (!response.ok) throw new Error('Filen ble ikke funnet.');

        let markdownText = await response.text();
        
        // Get current values from inputs
        const weight = parseFloat(weightInput.value) || 0;
        const age = parseFloat(ageInput.value) || 0;
        const unit = ageUnit.value;

        // --- PROCESS A: WETFLAG TABLE ({{calc:key}}) ---
        const wetflagResults = getWetflagResults(weight, age, unit);
        markdownText = markdownText.replace(/{{calc:(\w+)}}/g, (match, key) => {
            return wetflagResults[key] || '<span style="opacity:0.5;">...</span>';
        });

        // --- PROCESS B: GENERAL DOSAGES ({{dose:amount:unit:max}}) ---
        // Anafylaksi og andre dokumenter. 
        if (weight > 0) {
            markdownText = markdownText.replace(/{{dose:(\d+\.?\d*):?([a-zA-Z]+)?:?(\d+\.?\d*)?}}/g, (match, amount, unit, max) => {
                let totalAmount = parseFloat(amount) * weight;
                let isMaxed = false;
                
                if (max && totalAmount > parseFloat(max)) {
                    totalAmount = parseFloat(max);
                    isMaxed = true;
                }
                
                const formattedAmount = Number(totalAmount.toFixed(2)); 
                const displayUnit = unit || 'mg'; 
                
                let html = `<strong style="color:#E1B12C; font-size:1.1em;">${formattedAmount} ${displayUnit}</strong>`;
                if (isMaxed) {
                    html += ` <span style="color:#ff7675; font-size:0.85em;">(Maks dose nådd)</span>`;
                } else {
                    html += ` <span style="font-size:0.85em; opacity:0.8;">(${amount} ${displayUnit}/kg)</span>`;
                }
                return html;
            });
        }
        

        // Convert to HTML and display with fade-in
        const cleanHTML = marked.parse(markdownText);
        
        contentArea.style.opacity = 0;
        setTimeout(() => {
            contentArea.innerHTML = cleanHTML;
            contentArea.style.opacity = 1;
        }, 150);

    } catch (error) {
        contentArea.innerHTML = `<p style="color: #ff7675;">Kunne ikke laste innhold: ${error.message}</p>`;
    }
};

// ==========================================
// SECTION 4: EVENT LISTENERS & INIT
// ==========================================

// Re-calculate and re-render whenever weight, age, or unit changes
[weightInput, ageInput, ageUnit].forEach(inputElement => {
    if(inputElement) {
        inputElement.addEventListener('input', () => {
            const activeBtn = document.querySelector('.tab-btn.active');
            if (activeBtn) loadMarkdown(activeBtn);
        });
    }
});

// Tab button clicks
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => loadMarkdown(button));
});

// Load first tab on start
window.addEventListener('DOMContentLoaded', () => {
    const firstTab = document.querySelector('.tab-btn.active');
    if (firstTab) loadMarkdown(firstTab);
});