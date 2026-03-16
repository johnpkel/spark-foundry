import fs from 'fs';
import path from 'path';
import PrdContent from './PrdContent';

export const metadata = {
  title: 'PRD — Spark Foundry',
  description: 'Product Requirements Document for Spark Foundry',
};

export default function PrdPage() {
  const filePath = path.join(process.cwd(), 'PRD.md');
  const markdown = fs.readFileSync(filePath, 'utf-8');

  return <PrdContent markdown={markdown} />;
}
