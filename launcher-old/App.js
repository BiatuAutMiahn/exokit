const {BrowserWindow} = require('electron');
const {app} = require('electron');
const {ipcMain} = require('electron');
const {spawn} = require('child_process');
const path = require('path');
const url = require('url');
const https = require('https');
const fs = require('fs');
const opn = require('opn');
const downloadsFolder = require('downloads-folder');

let exokitPath;
if(process.platform === 'win32'){
  exokitPath = '..\\scripts\\exokit.cmd';
}
else{
  exokitPath = '../scripts/exokit.sh';
}

let window = null;

// Wait until the app is ready
app.once('ready', () => {
  // Create a new window
  window = new BrowserWindow({
    center: true,
    height: 600,
    width: 1000,
    minHeight: 600,
    minWidth: 1000,
    maxHeight: 600,
    maxWidth: 1000,
    // Set the default background color of the window to match the CSS
    // background color of the page, this prevents any white flickering
    backgroundColor: '#D6D8DC',
    // Don't show the window until it's ready, this prevents any white flickering
    show: false,

    icon: path.join(__dirname, 'ExokitLogo.png')
  });

  // Load a URL in the window to the local index.html path
  window.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Show window when page is ready
  window.once('ready-to-show', () => {
    window.show();
  });
});


// Accept communication from frontend, arg1 will always be the key to the function... arg2/arg3 is for extra data like a URL/flags.
ipcMain.on('asynchronous-message', (event, arg1, arg2, arg3) => {
  switch (arg1) {

  case 'social':
    opn(arg2);
    break;

  case 'terminal':
    console.log(typeof arg2, typeof arg3);
    console.log(arg2, arg3);
    // arg2 is url, arg3 is flags, they can be empty or filled.
    if(arg3.length > 0 && arg2.length > 0){ // launch with both flag and url
      spawn(exokitPath, [arg2, '-' + arg3], {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
    }
    if(arg3.length > 0){ // launch with just a flag
      spawn(exokitPath, ['-' + arg3], {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
    }
    if(arg2.length > 0){ // launch with just a URL parameter
      spawn(exokitPath, [arg2], {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
    }
    else{ // launch with nothing extra
      if(process.platform === 'darwin'){
        spawn('sh', [exokitPath], {shell: true, detached: true});
      }
      else{
        spawn(exokitPath, {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
      }
    }
    break;

  case 'exohome':
    spawn(exokitPath, [arg2, '-' + 'h' + arg3], {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
    break;

  case 'version':
    const version = spawn(exokitPath, ['-v']);
    let stdout = '';
    version.stdout.on('data', (data) => {
      stdout += String(data);
    });

    version.once('exit', function() {
      // Send the userVersion to Frontend
      const userVersion = stdout.slice(0, 7);
      event.sender.send('asynchronous-reply', userVersion);
      console.log('User Version:', userVersion);

      https.get('https://get.webmr.io/version', (res) => {
        console.log('Checking Upstream Version...');
        let data = '';
        res.on('data', (d) => {
          data += String(d);
        });

        res.on('end', () => {
          const json = JSON.parse(data);
          if(json['version'] != null){
            let upstreamVersion = json['version'].slice(1, 8);
            console.log('Upstream Version:', upstreamVersion);
            // Send the upstreamVersion to Frontend
            event.sender.send('asynchronous-reply', upstreamVersion);
          }
          else{
            console.log('Version returned null from upstream');
            // Send the upstreamVersion to Frontend
            event.sender.send('asynchronous-reply', null);
          }
        });

      }).on('error', (e) => {
        console.error(e);
      });
    });
    break;

  case 'update':
    let writeStream = fs.createWriteStream(downloadsFolder() + 'exokit-installer.exe');

    let url = '';

    console.log('Detected OS:', process.platform);

    switch (process.platform) {
    case 'win32':
      url = 'https://get.webmr.io/windows';
      break;
    case 'darwin':
      url = 'https://get.webmr.io/macos';
      break;
    case 'linux':
      url = 'https://get.webmr.io/linux';
      break;
    }

    https.get(url, (res) => {

      console.log('Downloading Exokit...');

      const downloadSize = res.headers['content-length' ];
      let chunkSize = 0;
      let prevChunkSize = 0;
      let prevProgress = 0;
      let currentProgress = 0;

      res.on('data', (d) => {
        prevChunkSize = chunkSize;
        prevProgress = ((prevChunkSize / downloadSize) * 100).toFixed(0);
        chunkSize += d.length;
        currentProgress = ((chunkSize / downloadSize) * 100).toFixed(0);
        writeStream.write(d);
        if(prevProgress !== currentProgress){
          event.sender.send('asynchronous-reply', currentProgress);
        }
      });

      res.on('end', () => {
        console.log('Download complete!');
        writeStream.close();
      });

    }).on('error', (e) => {
      console.error(e);
    });

    writeStream.on('finish', () => {
      launchInstaller();
    });
    break;

  default:
    event.sender.send('asynchronous-reply', 'message does not make sense to electron backend');
    break;
  }
  function launchInstaller(){
    let child;
    if(process.platform === 'win32'){
      child = spawn(downloadsFolder() + 'exokit-installer.exe', [], {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
    }
    if(process.platform === 'darwin'){
      child = spawn(downloadsFolder() + '/exokit-macos-x64.dmg', [], {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
    }
    if(process.platform === 'linux'){
      child = spawn(downloadsFolder() + '/exokit-installer.exe', [], {detached: true, stdio: ['ignore', 'ignore', 'ignore']});
    }

    child.on('close', (code) => {
      console.log(`child close process exited with code ${code}`);
      event.sender.send('asynchronous-reply', 'code:' + code);
    });

    child.on('error', (code) => {
      console.log(`child error process exited with code ${code}`);
      event.sender.send('asynchronous-reply', 'code:' + code);
    });
  }
});



