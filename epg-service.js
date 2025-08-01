// epg-service.js - REPLACE YOUR EXISTING FILE WITH THIS OPTIMIZED VERSION
const axios = require('axios');
const xml2js = require('xml2js');

class EPGService {
    constructor() {
        this.cachedData = null;
        this.lastUpdate = null;
        this.isUpdating = false;
        this.updateInterval = 60 * 60 * 1000; // 1 hour
        this.epgUrl = 'https://xtream.johnsonflix.tv/xmltv.php?username=johnsonflixiptv&password=08108672';
        this.parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false,
            mergeAttrs: true,
            // Memory optimization settings
            trim: true,
            normalize: true,
            normalizeTags: true
        });
    }

    async initialize() {
        console.log('📺 Initializing EPG Service...');
        
        // Load data immediately
        await this.updateCache();
        
        // Set up hourly updates
        setInterval(() => {
            this.updateCache();
        }, this.updateInterval);
        
        console.log('✅ EPG Service initialized - updating hourly');
    }

    async updateCache() {
        if (this.isUpdating) {
            console.log('⏳ EPG update in progress, skipping...');
            return;
        }

        this.isUpdating = true;
        console.log('🔄 Updating EPG cache...');
        
        try {
            const startTime = Date.now();
            
            // Clear previous cache to free memory
            this.cachedData = null;
            if (global.gc) {
                global.gc(); // Force garbage collection if available
            }
            
            console.log('📡 Fetching EPG data...');
            
            // Fetch XML with streaming and memory limits
            const response = await axios.get(this.epgUrl, {
                timeout: 120000, // 2 minutes for large file
                maxContentLength: 200 * 1024 * 1024, // 200MB limit
                maxBodyLength: 200 * 1024 * 1024,
                headers: { 
                    'User-Agent': 'JohnsonFlix-EPG/1.0',
                    'Accept-Encoding': 'gzip, deflate' // Enable compression
                },
                responseType: 'text'
            });

            const dataSize = response.data.length;
            console.log(`📊 Fetched ${(dataSize / 1024 / 1024).toFixed(1)}MB of EPG data`);

            if (dataSize > 150 * 1024 * 1024) { // 150MB limit
                throw new Error('EPG data too large, server may run out of memory');
            }

            console.log('🔄 Parsing XML data (this may take a moment)...');
            
            // Parse XML in chunks to prevent memory issues
            const xmlData = await this.parseXMLSafely(response.data);
            
            if (!xmlData || !xmlData.tv) {
                throw new Error('Invalid EPG format - missing TV data');
            }

            console.log('🔄 Processing EPG data...');
            
            // Process data with memory optimization
            this.cachedData = this.processDataOptimized(xmlData.tv);
            this.lastUpdate = new Date();
            
            // Clean up
            response.data = null;
            xmlData.tv = null;
            
            const time = Date.now() - startTime;
            console.log(`✅ EPG updated in ${(time/1000).toFixed(1)}s - ${this.cachedData.totalChannels} channels, ${this.cachedData.totalPrograms} programs`);
            
            // Force garbage collection
            if (global.gc) {
                global.gc();
            }
            
        } catch (error) {
            console.error('❌ EPG update failed:', error.message);
            
            // If memory error, suggest restart
            if (error.message.includes('memory') || error.message.includes('heap')) {
                console.error('💀 MEMORY ERROR - Server may need restart or more RAM');
            }
        } finally {
            this.isUpdating = false;
        }
    }

    async parseXMLSafely(xmlString) {
        try {
            // Parse with timeout to prevent hanging
            return await Promise.race([
                this.parser.parseStringPromise(xmlString),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('XML parsing timeout')), 60000)
                )
            ]);
        } catch (error) {
            console.error('XML parsing failed:', error.message);
            throw new Error(`XML parsing failed: ${error.message}`);
        }
    }

    processDataOptimized(tvData) {
        const now = new Date();
        const categories = {};
        const channelMap = new Map();
        let totalPrograms = 0;
        let processedChannels = 0;

        console.log('📺 Processing channels...');

        // Process channels with progress logging
        const channels = Array.isArray(tvData.channel) ? tvData.channel : [tvData.channel];
        
        channels.forEach((channel, index) => {
            if (index % 1000 === 0 && index > 0) {
                console.log(`📺 Processed ${index}/${channels.length} channels...`);
            }

            const id = channel.id;
            const name = Array.isArray(channel['display-name']) 
                ? channel['display-name'][0] 
                : channel['display-name'] || 'Unknown';
            
            const category = this.categorizeChannel(name);
            
            if (!categories[category]) {
                categories[category] = [];
            }

            const channelData = {
                id: id,
                name: name,
                category: category,
                programs: [],
                currentProgram: null,
                nextProgram: null
            };

            categories[category].push(channelData);
            channelMap.set(id, channelData);
            processedChannels++;
        });

        console.log(`📺 Processed ${processedChannels} channels`);
        console.log('📅 Processing programs...');

        // Process programs with memory optimization
        const programs = Array.isArray(tvData.programme) ? tvData.programme : [tvData.programme];
        const totalProgramCount = programs.length;
        
        console.log(`📅 Found ${totalProgramCount} programs to process`);

        // Process in batches to prevent memory issues
        const batchSize = 10000;
        let batchCount = 0;
        
        for (let i = 0; i < programs.length; i += batchSize) {
            const batch = programs.slice(i, i + batchSize);
            batchCount++;
            
            if (batchCount % 10 === 0) {
                console.log(`📅 Processing batch ${batchCount}... (${i}/${totalProgramCount} programs)`);
            }
            
            batch.forEach(program => {
                const channelId = program.channel;
                const title = Array.isArray(program.title) ? program.title[0] : program.title || 'No Title';
                const desc = Array.isArray(program.desc) ? program.desc[0] : program.desc || '';
                const start = program.start;
                const stop = program.stop;

                const channel = channelMap.get(channelId);
                if (channel) {
                    const startDate = this.parseTime(start);
                    const stopDate = this.parseTime(stop);
                    
                    // Skip programs that are too old (more than 6 hours ago)
                    const nowTime = now.getTime();
                    if (stopDate.getTime() < (nowTime - 6 * 60 * 60 * 1000)) {
                        return; // Skip old programs
                    }
                    
                    const programData = {
                        title: title,
                        description: desc.length > 100 ? desc.substring(0, 100) + '...' : desc, // Shorter descriptions
                        start: start,
                        stop: stop,
                        startTime: this.formatTime(startDate),
                        stopTime: this.formatTime(stopDate),
                        startDate: startDate.getTime(),
                        stopDate: stopDate.getTime()
                    };
                    
                    channel.programs.push(programData);
                    totalPrograms++;
                    
                    // Set current/next programs
                    if (programData.startDate <= nowTime && nowTime <= programData.stopDate) {
                        channel.currentProgram = programData;
                    } else if (programData.startDate > nowTime && !channel.nextProgram) {
                        channel.nextProgram = programData;
                    }
                }
            });
            
            // Clear batch from memory
            batch.length = 0;
        }

        console.log(`📅 Processed ${totalPrograms} programs`);
        console.log('🔄 Finalizing data...');

        // Finalize data with memory optimization
        Object.values(categories).forEach(categoryChannels => {
            categoryChannels.forEach(channel => {
                // Sort programs
                channel.programs.sort((a, b) => a.startDate - b.startDate);
                
                // Limit to 10 programs per channel for memory efficiency
                const nowTime = now.getTime();
                channel.programs = channel.programs
                    .filter(p => p.stopDate >= (nowTime - 2 * 60 * 60 * 1000)) // Last 2 hours only
                    .slice(0, 10); // Max 10 programs per channel
                
                // Ensure current/next are set
                if (!channel.currentProgram || !channel.nextProgram) {
                    for (let program of channel.programs) {
                        if (program.startDate <= nowTime && nowTime <= program.stopDate) {
                            channel.currentProgram = program;
                        } else if (program.startDate > nowTime && !channel.nextProgram) {
                            channel.nextProgram = program;
                            break;
                        }
                    }
                }
            });
        });

        const finalData = {
            categories: Object.keys(categories).sort(),
            data: categories,
            totalChannels: channelMap.size,
            totalPrograms: totalPrograms,
            lastUpdated: now.toISOString(),
            cacheTime: now.getTime()
        };

        console.log('✅ Data processing complete');
        return finalData;
    }

    categorizeChannel(name) {
        const n = name.toLowerCase();
        
        if (n.includes('sport') || n.includes('espn') || n.includes('fox sports') || n.includes('nfl') || n.includes('nba') || n.includes('mlb')) {
            return 'Sports';
        } else if (n.includes('news') || n.includes('cnn') || n.includes('fox news') || n.includes('msnbc') || n.includes('bbc')) {
            return 'News';
        } else if (n.includes('kids') || n.includes('cartoon') || n.includes('disney') || n.includes('nick') || n.includes('family')) {
            return 'Kids & Family';
        } else if (n.includes('movie') || n.includes('cinema') || n.includes('film') || n.includes('hbo') || n.includes('showtime')) {
            return 'Movies';
        } else if (n.includes('music') || n.includes('mtv') || n.includes('vh1') || n.includes('cmt')) {
            return 'Music';
        } else if (n.includes('food') || n.includes('cooking') || n.includes('travel') || n.includes('discovery') || n.includes('history')) {
            return 'Lifestyle & Documentary';
        } else if (n.includes('comedy') || n.includes('fx') || n.includes('tbs') || n.includes('usa')) {
            return 'Entertainment';
        } else {
            return 'General';
        }
    }

    parseTime(timeString) {
        if (!timeString) return new Date();
        
        try {
            const year = parseInt(timeString.substring(0, 4));
            const month = parseInt(timeString.substring(4, 6)) - 1;
            const day = parseInt(timeString.substring(6, 8));
            const hour = parseInt(timeString.substring(8, 10));
            const minute = parseInt(timeString.substring(10, 12));
            const second = parseInt(timeString.substring(12, 14)) || 0;
            
            return new Date(year, month, day, hour, minute, second);
        } catch (error) {
            return new Date();
        }
    }

    formatTime(date) {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    getData() {
        return this.cachedData;
    }

    getStatus() {
        return {
            lastUpdate: this.lastUpdate,
            isUpdating: this.isUpdating,
            dataAvailable: !!this.cachedData,
            totalChannels: this.cachedData?.totalChannels || 0,
            totalPrograms: this.cachedData?.totalPrograms || 0,
            memoryUsage: process.memoryUsage()
        };
    }

    async forceUpdate() {
        console.log('🔄 Manual EPG refresh requested');
        return this.updateCache();
    }
}

module.exports = EPGService;