/**
 * Created by michaelhall on 24/8/17.
 */
var io         = require('../app.js'),
    express    = require('express'),
    router     = express.Router();

const spawn      = require('child_process').spawn,
      path       = require('path'),
      fs         = require('fs'),
      config     = require('../config.json');


// GET analysis view
router.get('/', function(req, res) {
    res.render('index');
});


// connecting to the websocket opened when the client clicks the get started button
io.of('/').on('connection', function(socket){

    socket.on('error', function(error) {
        if (error) console.log(error);
    });

    socket.on('opts', function(data) {
	    var inputPath = resolveHome(data.input);

    	// check that input directory exists
		if (!fs.existsSync(inputPath)) {
			// todo find elegant way of handling this
			throw new Error('INPUT DIRECTORY DOES NOT EXIST!');
		}

        // create processes
        const watcher = runWatcher(inputPath, data.fileType),
	          minimap = runMinimap(inputPath),
              species = runSpeciesTyping(inputPath);

        ///////////// CONFIGURE PIPES FOR PROCESSES ////////////

	    watcher.on('error', function(err) {
	    	console.log(err);
	    	species.kill();
	    	minimap.kill();
	    });

	    watcher.on('close', function(code, signal) {
		    if (code || signal) console.log("minimap2 closed " + code + " " + signal + ' at ' + new Date());
	    });

	    watcher.on('exit', function(code, signal) {
		    if (code || signal) console.log("minimap2 exited " + code + " " + signal + ' at ' + new Date());
	    });

	    watcher.stderr.setEncoding('utf8');
	    watcher.stdout.setEncoding('utf8');
	    minimap.stderr.setEncoding('utf8');
	    minimap.stdout.setEncoding('utf8');
	    species.stderr.setEncoding('utf8');
	    species.stdout.setEncoding('utf8');

	    watcher.stdout.on('data', function(data) {
	    	minimap.stdin.write(data);
	    });

        minimap.on('error', function(err) {
	        console.log(err);
	        species.kill();
	        watcher.kill();
        });

        minimap.on('close', function(code, signal) {
            if (code || signal) console.log("minimap2 closed " + code + " " + signal + ' at ' + new Date());
        });

        minimap.on('exit', function(code, signal) {
            if (code || signal) console.log("minimap2 exited " + code + " " + signal + ' at ' + new Date());
        });

        minimap.stdout.on('data', function(data) {
            species.stdin.write(data);
        });

        species.on('error', function(err) {
		    console.log(err);
		    minimap.kill();
		    watcher.kill();
        });

        species.on('close', function(code, signal) {
		    if (code || signal) console.log("species typer closed " + code + " " + signal + ' at ' + new Date());
        });

        species.on('exit', function(code, signal) {
		    if (code || signal) console.log("species typer exited " + code + " " + signal + ' at ' + new Date());
        });

        species.stdout.on('data', function(data) {
	        // parse output into JSON format and send to client
	        var recentResults = JSON.parse(data);
	        socket.emit('stdout', recentResults);
        });


	    /////////// WRITE LOG FILES IF REQUIRED ////////////
		if (data.logLocation) {
			const writeTo = resolveHome(data.logLocation),
			      timestamp = Date.now().toString();

			var minimapLog = fs.createWriteStream(
				path.join(writeTo, 'minimap.' + timestamp + '.stderr')),
			watcherLog = fs.createWriteStream(
				path.join(writeTo, 'watcher.' + timestamp + '.stderr')),
			speciesLog = fs.createWriteStream(
				path.join(writeTo, 'species.' + timestamp + '.stderr')),
			speciesOutput = fs.createWriteStream(
				path.join(writeTo, 'species.' + timestamp + '.dat'));

        	minimap.stderr.pipe(minimapLog);
        	watcher.stderr.pipe(watcherLog);
        	species.stderr.pipe(speciesLog);
        	species.stdout.pipe(speciesOutput);
		}
    });

    socket.on('kill', function(){
        socket.disconnect();
    });

});

// returns the command line process for strom
function runWatcher(watchDir, fileType) {
	console.log('File watcher called at ' + new Date());

	var watcherArgs = [
		'-i' + watchDir, // directory to watch
		'-t.' + fileType // file type to watch for
	];

	var watchOpts = { cwd: watchDir };

	return spawn(resolveHome(config.watcher), watcherArgs, watchOpts);
}


// returns the command line process for minimap2
function runMinimap(inputPath) {
    console.log('minimap2 called at ' + new Date());

	// todo add in option to go straight from fastq rather than real-time

    var minimapArgs = [
        '-a',  // output SAM format
        '-K 10000', // flush the buffer every 10K instead of 200M
        '-I ' + config.minimap2.memory,  // memory allocation to minimap2
        '-t' + config.minimap2.threads,  // threads to allocate to minimap2
        resolveHome(config.database),  // path to the database/index
        '-' // input from stdin
    ];

    var minimapOptions = { cwd: inputPath };

    return spawn(resolveHome(config.minimap2.executable), minimapArgs, minimapOptions);
}

// returns the command line process for species typing
function runSpeciesTyping(inputPath) {
    console.log('Species typing called at ' + new Date());

    var speciesArgs = [
        '--web',  // output in JSON format
        '--bamFile=-',  // accept BAM/SAM from stdin only. Could change if need be
        '--indexFile=' + resolveHome(config.speciesIndex),
        '--qual=' + config.speciesTyper.quality,
        '--time=5', // min. number of seconds between analysis
        '--output=-'  // output to stdout. can write to file from event listener
    ];

    var speciesOptions = { cwd: inputPath };

    return spawn(resolveHome(config.speciesTyper.executable), speciesArgs, speciesOptions);
}

// function to resolve ~/ as home directory
function resolveHome(filepath) {
	if (filepath[0] === '~') {
		return path.join(process.env.HOME, filepath.slice(1));
	}
	return filepath;
}


module.exports = router;
