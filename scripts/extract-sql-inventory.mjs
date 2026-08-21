import fs from "node:fs";
import path from "node:path";

const serverDirectory = "/home/ubuntu/dashboard-ventas/server";
const sourceFiles = fs.readdirSync(serverDirectory)
  .filter((fileName) => fileName.endsWith(".ts") && !fileName.endsWith(".test.ts"))
  .map((fileName) => path.join(serverDirectory, fileName));

const results = [];

for (const sourceFile of sourceFiles) {
  const source = fs.readFileSync(sourceFile, "utf8");
  const lines = source.split("\n");
  const sqlTemplatePattern = /`\s*((?:WITH|SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[\s\S]*?)`/gi;
  let match;

  while ((match = sqlTemplatePattern.exec(source)) !== null) {
    const startOffset = match.index;
    const startLine = source.slice(0, startOffset).split("\n").length;
    const precedingLines = lines.slice(Math.max(0, startLine - 25), startLine).join("\n");
    const procedureMatches = [...precedingLines.matchAll(/([a-zA-Z0-9_]+)\s*:\s*(?:publicProcedure|protectedProcedure|adminProcedure)[\s\S]{0,350}?\.(?:query|mutation)\s*\(/g)];
    const variableMatches = [...precedingLines.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*`?\s*$/gm)];
    const procedure = procedureMatches.at(-1)?.[1] ?? "sin_nombre_de_procedimiento_detectado";
    const assignedVariable = variableMatches.at(-1)?.[1] ?? "consulta_embebida";
    results.push({
      sourceFile: path.basename(sourceFile),
      startLine,
      procedure,
      assignedVariable,
      sql: match[1].trim(),
    });
  }

  const sqlStringPattern = /["']((?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^"'\n]*)["']/gi;
  while ((match = sqlStringPattern.exec(source)) !== null) {
    const startOffset = match.index;
    const startLine = source.slice(0, startOffset).split("\n").length;
    if (lines[startLine - 1]?.includes("`")) continue;
    results.push({
      sourceFile: path.basename(sourceFile),
      startLine,
      procedure: "consulta_utilitaria",
      assignedVariable: "consulta_embebida_en_linea",
      sql: match[1].trim(),
    });
  }
}

results.sort((left, right) => left.sourceFile.localeCompare(right.sourceFile) || left.startLine - right.startLine);
const outputPath = "/home/ubuntu/dashboard-ventas/sql-inventory-raw.json";
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`Consultas detectadas: ${results.length}`);
console.log(outputPath);
