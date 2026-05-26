import fs from 'fs';
import https from 'https';
import path from 'path';

const url = 'https://i.pinimg.com/564x/a9/17/3c/a9173cc856d28364a8bb67efdc749ec4.jpg';

if (!fs.existsSync('assets')) {
    fs.mkdirSync('assets');
}

const file = fs.createWriteStream('assets/icon.png');
https.get(url, function(response) {
  response.pipe(file);
  file.on('finish', function() {
    file.close();  
  });
});
