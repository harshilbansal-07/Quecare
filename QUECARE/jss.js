
const registrationForm = document.getElementById("registrationForm");

if (registrationForm) {
    registrationForm.addEventListener("submit", function(event) {
        event.preventDefault();

        const name = document.getElementById("patientName").value.trim();
        const mobile = document.getElementById("mobile").value.trim();
        const department = document.getElementById("department").value;

        if (!/^[0-9]{10}$/.test(mobile)) {
            document.getElementById("message").textContent =
                "Please enter a valid 10-digit mobile number.";
            return;
        }

        document.getElementById("message").textContent =
            "Registration form validated successfully! Backend token generation is coming next.";

        console.log({
            name: name,
            mobile: mobile,
            department: department
        });
    });
}

function getToken() {
    window.location.href = "register.html";
}
