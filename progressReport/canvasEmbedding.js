const currentUrl = window.location.href;



const targetPageUrl = 'https://ucberkeleysandbox.instructure.com/courses/141/pages/concept-map?module_item_id=418';
const alternateTargetPageUrl = 'https://ucberkeleysandbox.instructure.com/courses/141/pages/concept-map';


// Check if the current URL matches the target page URL
if (currentUrl === targetPageUrl || currentUrl === alternateTargetPageUrl) {
    const accessToken = '26530~etwvNZ2z3WXDxP9CXDeDNCmKN3MCWEKtDaYrQ7JRVGJ6nkBUcR8V4VURDVMBuLeW';
    const courseId = '141';
    const studentId = ENV.current_user_id;    // Replace with the actual student ID

    let mastery_string = ""

     fetch(`https://ucberkeleysandbox.instructure.com/api/v1/courses/${courseId}/students/submissions?student_ids[]=${studentId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    })
         .then(response => response.json())
         .then(data => {
             // Assignments appear to be returned in order of creation.
             // This would be implemented slightly differently for the clients; we can create a list of assignment ids which maps as a constant
             data.forEach(submission =>
                 mastery_string += submission.score
             });
             const iframe = document.createElement('iframe');

             console.log("Here")
             console.log(mastery_string)

             // Set the iframe attributes (customize these as needed)
             console.log(`https://gradeview.eecs.berkeley.edu/progress?show_legend=false&student_mastery=${mastery_string}`)
             iframe.src = `https://gradeview.eecs.berkeley.edu/progress?show_legend=false&student_mastery=${mastery_string}`; // Set the source URL of the iframe
             iframe.width = '100%';              // Set the width of the iframe
             iframe.height = '1000px';            // Set the height of the iframe
             iframe.style.border = 'none';       // Remove the border of the iframe (optional)

             // Append the iframe to the body element
             document.body.appendChild(iframe);
             //document.getElementById('mobile-header-title expandable').appendChild(iframe);
         })
         .catch(error => {
             console.error('Error:', error);
         });


}