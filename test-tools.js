import fs from 'fs/promises';
import path from 'path';

// Test the helper functions directly
const ROOT_ABS = path.resolve('/Users/sten/Documents/Coding/gesagent/data/gesetze');

function extractSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let currentSection = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match German law sections: § 123, ### § 123, ## Abschnitt 1, etc.
    const sectionMatch = line.match(/^#+\s*(§\s*\d+[a-z]*|Abschnitt\s+\d+|Teil\s+\d+|Kapitel\s+\d+|Unterabschnitt\s+\d+)(.*)/) || 
                         line.match(/^(§\s*\d+[a-z]*)(.*)/);
    
    if (sectionMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        id: sectionMatch[1].trim(),
        title: sectionMatch[2] ? sectionMatch[2].trim() : '',
        startLine: i + 1,
        content: [line]
      };
    } else if (currentSection) {
      currentSection.content.push(line);
    }
  }
  
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

async function testFileInfo(filename) {
  console.log(`\n🔍 Testing: ${filename}`);
  const full = path.join(ROOT_ABS, filename);
  const content = await fs.readFile(full, 'utf8');
  const sections = extractSections(content);
  const size = content.length;
  const lines = content.split('\n').length;
  
  console.log(`📊 Size: ${Math.round(size/1024)}KB, ${lines} lines`);
  console.log(`📑 Sections found: ${sections.length}`);
  console.log(`🎯 First 5 sections:`);
  sections.slice(0, 5).forEach(s => {
    console.log(`   - ${s.id}: ${s.title}`);
  });
}

async function testReadSection(filename, sectionId) {
  console.log(`\n🎯 Testing section extraction: ${filename} - ${sectionId}`);
  const full = path.join(ROOT_ABS, filename);
  const content = await fs.readFile(full, 'utf8');
  const sections = extractSections(content);
  
  const targetSection = sections.find(s => 
    s.id.toLowerCase().includes(sectionId.toLowerCase())
  );
  
  if (targetSection) {
    console.log(`✅ Found: ${targetSection.id} - ${targetSection.title}`);
    console.log(`📝 Content preview: ${targetSection.content.slice(0, 3).join('\n').slice(0, 200)}...`);
  } else {
    console.log(`❌ Section not found. Available: ${sections.slice(0, 5).map(s => s.id).join(', ')}`);
  }
}

// Run tests
console.log('🧪 Testing Large File Handling Tools');

await testFileInfo('b/bgb/index.md');
await testFileInfo('a/agg/index.md');
await testReadSection('b/bgb/index.md', '§ 823');
await testReadSection('a/agg/index.md', '§ 1');

console.log('\n✅ Tests completed!');