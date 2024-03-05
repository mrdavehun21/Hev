// Define arrays to store the numbers
var numbersArray1 = [];
var numbersArray2 = [];

// Define prompt texts separately
var promptTextB = "Battyány tér irány pályaszáma";
var promptTextK = "Középső kocsi pályaszáma";
var promptTextSZ = "Szentendre irány pályaszáma";

function palyaSzam(promptId, indexId){
    var promptText;

    // Determine the correct prompt text based on the promptId
    if (promptId === "pSzamB") {
        promptText = promptTextB;
    } else if (promptId === "pSzamK") {
        promptText = promptTextK;
    } else if (promptId === "pSzamSZ") {
        promptText = promptTextSZ;
    }

    var num = prompt(promptText); // Prompt the user for input
    if (num !== null) { // Check if the user clicked "Cancel"
        var buttonId = promptId + indexId; // Construct the button ID
        var button = document.getElementById(buttonId); // Select the correct button
        button.textContent = num; // Update the text content of the button

        // Choose the correct array based on the indexId
        var numbersArray;
        if (indexId === 1) {
            numbersArray = numbersArray1;
        } else if (indexId === 2) {
            numbersArray = numbersArray2;
        }

        numbersArray.push(num); // Add the entered number to the array

        // Check if there are 3 numbers in the array
        if (numbersArray.length % 3 === 0) {
            // Add a newline character after every 3 numbers
            document.getElementById("result" + indexId).textContent = numbersArray.join("\n");
        }
    }
}



