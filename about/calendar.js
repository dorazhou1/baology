
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
