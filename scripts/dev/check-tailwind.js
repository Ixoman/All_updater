import tailwindcss from 'tailwindcss';
console.log('Type:', typeof tailwindcss);
console.log('Value:', tailwindcss);
try {
    console.log('Result:', tailwindcss({}));
} catch (e) {
    console.log('Error calling:', e.message);
}
