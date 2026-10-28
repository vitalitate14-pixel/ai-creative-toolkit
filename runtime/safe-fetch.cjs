const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');

const blockedV4 = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blockedV4.addSubnet(address, prefix);
const publicV6 = new net.BlockList();
publicV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new net.BlockList();
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) blockedV6.addSubnet(address, prefix, 'ipv6');

function isPublicAddress(address) {
    if (net.isIP(address) === 4) return !blockedV4.check(address, 'ipv4');
    if (net.isIP(address) === 6) return publicV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
    return false;
}

function isSameOriginRequest(req) {
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    if (!req.headers.origin) return true;
    try {
        const origin = new URL(req.headers.origin);
        return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host;
    } catch { return false; }
}

/** Public HTTP(S) only. Validate every redirect and pin the checked DNS answer
 * to the connection, preventing DNS rebinding between validation and use. */
async function safePublicFetch(value, options = {}, dependencies = {}) {
    const lookup = dependencies.lookup || dns.lookup;
    const request = dependencies.request || ((url, opts, callback) => (url.protocol === 'https:' ? https : http).request(url, opts, callback));
    const deadline = Date.now() + (options.timeoutMs || 30000);
    let target = new URL(value);
    let method = options.method || 'GET';
    let body = options.body;
    for (let redirects = 0; redirects <= 5; redirects++) {
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || (target.port && !['80', '443'].includes(target.port))) throw new Error('Unsupported public URL');
        const hostname = target.hostname.replace(/^\[|\]$/g, '');
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Proxy timeout');
        let dnsTimer;
        let addresses;
        try {
            addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }]
                : await Promise.race([lookup(hostname, { all: true, verbatim: true }), new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('DNS timeout')), remaining); })]);
        } finally { clearTimeout(dnsTimer); }
        if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error('Private or reserved destination is not allowed');
        const pinned = addresses[0];
        const result = await new Promise((resolve, reject) => {
            const req = request(target, {
                method, headers: options.headers, agent: false,
                lookup: (_host, opts, callback) => opts.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
            }, res => {
                const status = res.statusCode;
                if (!status || status < 200 || status > 599) {
                    res.destroy(); reject(new Error('Invalid upstream status')); return;
                }
                if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
                    res.destroy();
                    resolve({ redirect: res.headers.location, status });
                    return;
                }
                const chunks = [];
                let size = 0;
                res.on('data', chunk => {
                    size += chunk.length;
                    if (size > (options.maxBytes || 128 * 1024 * 1024)) {
                        res.destroy(new Error('Proxy response exceeds limit'));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on('error', reject);
                res.on('end', () => {
                    const headers = new Headers();
                    for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
                    resolve({ response: new Response(method === 'HEAD' || [204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers }) });
                });
            });
            const timer = setTimeout(() => req.destroy(new Error('Proxy timeout')), Math.max(1, deadline - Date.now()));
            req.on('close', () => clearTimeout(timer));
            req.on('error', reject);
            if (body) req.write(body);
            req.end();
        });
        if (result.response) return result.response;
        target = new URL(result.redirect, target);
        if (result.status === 303 || ([301, 302].includes(result.status) && method === 'POST')) { method = 'GET'; body = undefined; }
    }
    throw new Error('Too many redirects');
}

module.exports = { isPublicAddress, isSameOriginRequest, safePublicFetch };
