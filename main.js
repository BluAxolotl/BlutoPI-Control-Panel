const print = console.log
const internalIp = require('internal-ip')
const path = require('path')
const { spawn, exec } = require('node:child_process')
const ini = require('multi-ini')
const fs = require('fs')
const Stream = require('stream')
const util = require('node:util')
const asyncExec = (cmd, opts) => {
	return new Promise((res, rej) => {
		var proc = exec(cmd, opts)
		print(`NEW PROCESS [ ${cmd} ]`)
		proc.stdout.on('data', data => {
			print(data)
		})
		proc.on('exit', (code) => {
			// print(`${cmd}: ${code}`)
			res(code)
		})
	})
}
const asyncMultiExec = (cmds, opts) => {
	return new Promise(async (res, rej) => {
		var proms = []

		cmds.forEach(cmd => {
			proms.push(asyncExec(cmd, opts))
		})

		let codes = await Promise.all(proms)
		res(codes)
	})
}
const readline = require('readline')
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    historySize: 30,
    prompt: '$ '
})

const express = require('express')
const app = express()
const server = require('http').createServer(app);
const io = require('socket.io')(server);

Array.prototype.remove = function (index) {
    if (index > -1 && index < this.length-1) {
    	var return_value = this.splice(index, 1)
    	return return_value
    }
}

const APPS_PATH = `${__dirname}/apps.ini`
const PLATS_PATH = `${__dirname}/plats.ini`

if (!fs.existsSync(APPS_PATH)) { throw new Error("apps.ini Not Found") }
if (!fs.existsSync(PLATS_PATH)) { throw new Error("plats.ini Not Found") }

const apps_config = ini.read(APPS_PATH)
const plats_config = ini.read(PLATS_PATH, {nested_section_names: true})

const ROOT = (apps_config.root || "..")

var processes = {}
var debug = []

var outs = {}
var counts = {}
var status = {}

var platforms = plats_config
Object.keys(platforms).forEach(name => {
	platforms[name].update_cmds = Object.values(platforms[name].update_cmds)
})

var bluto_apps = Object.keys(apps_config).map(bluto_app => {
	let obj = apps_config[bluto_app]
	obj.name = bluto_app
	obj.dirname = obj.git.split("/")[4].split(".")[0]
	obj.input = new Stream.Readable({
    read(size) {
      return true;
    }
  })
	// obj.input.pipe(null)

	outs[bluto_app] = []
	debug[bluto_app] = {}
	debug[bluto_app].error = []
	debug[bluto_app].crash = []
	counts[bluto_app] = {}
	counts[bluto_app].error = 0
	counts[bluto_app].crash = 0
	status[bluto_app] = obj.status

	return obj
})

// Startup:
// ******************************
function init() {
	bluto_apps.forEach(bluto_app => {
		if (bluto_app.status == "ON") { app_spawn(bluto_app) }
	})
}

function update_repo(bluto_app) {
	return new Promise( async (res, rej) => {
		var APP_PATH = `${ROOT}/${bluto_app.dirname}/`
		if (fs.existsSync(APP_PATH)) {
			await asyncExec("git reset --hard", {cwd: APP_PATH})
			await asyncExec("git pull", {cwd: APP_PATH})
		} else {
			await asyncExec(`git clone ${bluto_app.git}`, {cwd: ROOT})
		}
		await asyncMultiExec(platforms[bluto_app.plat].update_cmds, {cwd: APP_PATH})
		res("Done!")
	})
}

async function update_repos() {
	return new Promise((res, rej) => {
		var app_count = bluto_apps.length
		var updated = 0
		bluto_apps.forEach(async (bluto_app) => {
			await update_repo(bluto_app)
			updated++
			if (updated == app_count) {
				print("Done updating!")
				res("Done!")
			}
		})
	})
}

function preinit_prompt() {
	let answered = async function (answer) {
		var answer = answer.toUpperCase()
		if (["Y", "N"].includes(answer)) {
			if (answer == "Y") {
				await update_repos()
			}
			init()
			init_webserver()
		} else {
			preinit_prompt()
		}
	}

	if (process.env.QUESTION) { rl.question("Checks for updates? [Y/N] ", answered) } else {
		answered(process.env.CHECK_FOR_UPDATES == "true" ? "Y" : "N")
	}
}

preinit_prompt()
// ******************************

// Main Logic:
// ******************************
function app_spawn(bluto_app) {
	var args = bluto_app.run.split(" ")
	var cmd = args.shift()

	// print(cmd, args, {cwd: `${ROOT}/${bluto_app.dirname}/`})
	let p = spawn(cmd, args, {cwd: `${ROOT}/${bluto_app.dirname}/`})
	p.stdout.on('data', data => {
		print(`[ ${bluto_app.name} ] ${data}`)
		let currTime = Date.now()
		outs[bluto_app.name].push({
			text: data.toString(),
			time: currTime
		})
		io.sockets.emit('data', bluto_app.name, data.toString(), currTime, "normal")
	})
	p.stderr.on(`data`, data => {
		print(`[ ${bluto_app.name} ] ${data}`)
		let currTime = Date.now()
		outs[bluto_app.name].push({
			text: data.toString(),
			time: currTime
		})
		counts[bluto_app.name].error++
		debug[bluto_app.name].error.push({
			text: data.toString(),
			time: currTime
		})
		io.sockets.emit('data', bluto_app.name, data.toString(), currTime, "error")
	})
	p.on('error', (err) => {
		print(`[ ${bluto_app.name} ] ${err}`)
		let currTime = Date.now()
		outs[bluto_app.name].push({
			text: err.toString(),
			time: currTime
		})
		counts[bluto_app.name].error++
		debug[bluto_app.name].error.push({
			text: err.toString(),
			time: currTime
		})
		io.sockets.emit('data', bluto_app.name, err.toString(), currTime, "error")
	})
	p.on('exit', (code, str) => {
		if (code != null) {
			let text = `Exited with code: ${code}\n\n\n[ SYSTEM ] Restarting app...\n\n\n`
			print(`[ ${bluto_app.name} ] ${text}`)
			let currTime = Date.now()
			outs[bluto_app.name].push({
				text: text,
				time: currTime
			})
			counts[bluto_app.name].crash++
			debug[bluto_app.name].crash.push({
				text: `Exited with code: ${code}`,
				time: currTime
			})
			io.sockets.emit('data', bluto_app.name, text, currTime, "exit")
			app_spawn(bluto_app)
		}
	})

	bluto_app.rl = readline.createInterface({
		input: p.stdin,
		output: p.stdout,
	});
	processes[bluto_app.name] = p
}

function send_line(app_name, line) {
	let pid = Object.keys(apps_config).indexOf(app_name)
	let p = processes[app_name]
	p.stdin.setEncoding('utf-8')

	p.stdin.cork()
	p.stdin.write(line+"\n")
	p.stdin.uncork()

	// let newStdin = new Stream.Writable()
	// newStdin._write = (chunk, encoding, callback) => {
		// p.stdin.write(chunk, encoding)
		// callback()
	// }
	// p.stdin = newStdin
}

io.on('connection', socket => {
	print(`[ SYSTEM ] + NEW SOCKET CONNECTION`)

	socket.emit('init', bluto_apps, outs, counts, status)

	socket.on('line', send_line)

	socket.on('print', data => {
		print("[ SYSTEM ] " + data)
	})

	socket.on('debug', (type, app_name) => {
		if (debug[app_name] != null) {
			socket.emit('debug', debug[app_name][type])
		}
	})

	socket.on('toggle', (app_name, pid) => {
		print(status[app_name])
		if (status[app_name] == "ON") {
			status[app_name] = 'OFF'			
			processes[app_name].kill()
			let text = "\n\n\n[ SYSTEM ] PROCESS KILLED BY CONTROL PANEL\n\n\n"
			outs[app_name].push(text)
			let currTime = Date.now()
			socket.emit('data', app_name, text, currTime, "normal")
		} else {
			status[app_name] = 'ON'
			app_spawn(bluto_apps[pid])
		}
		socket.emit('status_change', app_name, status[app_name])
	})
})

app.use('/', express.static(path.join(__dirname, 'website')))

app.get('/', (req, res) => {
  res.sendFile('/index.html', {root: path.join(__dirname, 'website')});
})

app.get('/debug', (req, res) => {
  res.sendFile('/debug.html', {root: path.join(__dirname, 'website')});
})

function init_webserver() {
	var host = internalIp.v4.sync()
	var port = 2026
	server.listen(port, host, () => {
		print(`Lisening @ ${host}:${port}`)
	})
}
// ******************************
// t( / U)t < [ Hi weird people! ]

