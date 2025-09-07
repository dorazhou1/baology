
var observer = new MutationObserver(function(mutations) {
    let styleSheet, styleSheets, styleSheetsNo;

    styleSheets = document.styleSheets;
    styleSheetsNo = styleSheets.length;
    console.log(styleSheets);
    if(styleSheets.length == 5)
        styleSheets.item(4).deleteRule(3);
});

observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});

//removes all:unset

// CSV parsing and table generation functions
function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            // Simple CSV parsing - handles basic cases
            const row = [];
            let current = '';
            let inQuotes = false;
            
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    row.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            row.push(current.trim());
            result.push(row);
        }
    }
    
    return result;
}

function generateTableFromCSV(csvData, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    // Clear existing tbody content
    const tbody = table.querySelector('tbody');
    if (tbody) {
        tbody.innerHTML = '';
    }
    
    // Skip header row (index 0) and process data rows
    for (let i = 1; i < csvData.length; i++) {
        const row = csvData[i];
        const tr = document.createElement('tr');
        
        // Week column (th)
        const weekTh = document.createElement('th');
        weekTh.setAttribute('scope', 'row');
        weekTh.textContent = row[0] || '';
        tr.appendChild(weekTh);
        
        // Other columns (td)
        for (let j = 1; j < row.length; j++) {
            const td = document.createElement('td');
            td.textContent = row[j] || '';
            tr.appendChild(td);
        }
        
        tbody.appendChild(tr);
    }
}

async function loadSyllabusFromCSV(csvPath, tableId) {
    try {
        const response = await fetch(csvPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        const csvData = parseCSV(csvText);
        generateTableFromCSV(csvData, tableId);
    } catch (error) {
        console.error('Error loading CSV:', error);
        // Fallback: show error message or keep existing table
    }
}

// Load syllabus when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadSyllabusFromCSV('syllabus-s6s2.csv', 'syllabus-s6s2');
    loadSyllabusFromCSV('syllabus-s6s1.csv', 'syllabus-s6s1');
});
