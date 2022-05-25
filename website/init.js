var socket = io()

if (console.everything === undefined)
{
    console.everything = [];

    console.defaultLog = console.log.bind(console);
        console.log = function(){
                let obj = {"type":"log", "datetime":Date().toLocaleString(), "value":Array.from(arguments)}
                console.everything.push(obj);
                console.defaultLog.apply(console, arguments);
                socket.emit("print", obj.value.join(" "))
        }
    console.defaultError = console.error.bind(console);
    console.error = function(){
                let obj = {"type":"error", "datetime":Date().toLocaleString(), "value":Array.from(arguments)}
        console.everything.push(obj)
        console.defaultError.apply(console, arguments);
                socket.emit("print", obj.value.join(" "))
    }
    console.defaultWarn = console.warn.bind(console);
    console.warn = function(){
                let obj = {"type":"warn", "datetime":Date().toLocaleString(), "value":Array.from(arguments)}
        console.everything.push(obj)
        console.defaultWarn.apply(console, arguments);
                socket.emit("print", obj.value.join(" "))
    }
    console.defaultDebug = console.debug.bind(console);
    console.debug = function(){
                let obj = {"type":"debug", "datetime":Date().toLocaleString(), "value":Array.from(arguments)}
        console.everything.push(obj)
        console.defaultDebug.apply(console, arguments);
                socket.emit("print", obj.value.join(" "))
    }
}

const print = console.log
const print_error = console.error
const print_warn = console.warn
const print_debug = console.debug