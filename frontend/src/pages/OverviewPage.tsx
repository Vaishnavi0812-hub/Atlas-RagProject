import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, FileStack, MessagesSquare, Network, Scale } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DependencyChainIllustration } from "@/components/overview/DependencyChainIllustration";
import { ease, staggerContainer } from "@/lib/motion";

const PIPELINE = [
  { step: "01", title: "Ingest", body: "PDF, DOCX, TXT and Markdown are extracted, cleaned and chunked with provenance." },
  { step: "02", title: "Embed", body: "Chunks are embedded and stored in Qdrant, isolated per organization and workspace." },
  { step: "03", title: "Extract", body: "An LLM extracts typed entities and relationships, each tied to its supporting text." },
  { step: "04", title: "Connect", body: "Entities are resolved and written to a Neo4j knowledge graph with full lineage." },
  { step: "05", title: "Reason", body: "Vector search and graph traversal combine to answer multi-hop questions with citations." },
];

const MODULES = [
  { to: "/documents", icon: FileStack, title: "Document library", body: "Upload and track ingestion jobs in real time.", tone: "persimmon" as const },
  { to: "/graph", icon: Network, title: "Knowledge graph", body: "Explore entities, neighbourhoods and evidence.", tone: "cobalt" as const },
  { to: "/chat", icon: MessagesSquare, title: "Ask ATLAS", body: "Question your documents across three retrieval modes.", tone: "gold" as const },
  { to: "/lab", icon: Scale, title: "Comparison lab", body: "Measure RAG against GraphRAG on the same corpus.", tone: "neutral" as const },
];

export function OverviewPage() {
  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <div className="min-w-0">
          <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Enterprise Knowledge Intelligence
          </motion.p>
          <motion.h1
            className="mt-4 text-[2.25rem] leading-[1.06] tracking-[-0.03em] text-graphite-900 sm:text-display-lg md:text-[3.75rem] md:leading-[1.02] md:tracking-[-0.035em]"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
          >
            Turn disconnected information into{" "}
            <em className="pr-[0.12em] font-normal italic text-persimmon-600">connected</em>{" "}
            intelligence.
          </motion.h1>
          <motion.p
            className="mt-6 max-w-lg text-[1.02rem] leading-relaxed text-graphite-600"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.1 }}
          >
            ATLAS reads your contracts, reports and policies, builds a knowledge graph of the
            entities and relationships inside them, and answers questions that span many
            documents, showing the evidence behind every answer.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.2 }}
          >
            <Link to="/documents">
              <Button size="lg" icon={<FileStack className="h-4 w-4" />}>
                Upload documents
              </Button>
            </Link>
            <Link to="/system">
              <Button size="lg" variant="secondary">
                View system status <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.15 }}
          className="relative min-w-0 overflow-hidden rounded-2xl bg-graphite-900 p-5 shadow-lift ring-1 ring-white/5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-graphite-400">
              Example · multi-hop question
            </span>
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-gold-500">
              4 documents · 3 hops
            </span>
          </div>
          <p className="mt-4 font-display text-lg leading-snug text-sand-100">
            “Which projects are at risk if Vendor Alpha fails to deliver, and do any have
            contracts expiring soon?”
          </p>
          <div className="mt-4 -mx-2">
            <DependencyChainIllustration />
          </div>
        </motion.div>
      </section>

      {/* Pipeline */}
      <section>
        <div className="flex items-end justify-between border-b hairline pb-4">
          <div>
            <p className="eyebrow">How ATLAS works</p>
            <h2 className="mt-2 text-display-md">From documents to evidence-backed answers</h2>
          </div>
        </div>
        <motion.ol
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-6 grid gap-px overflow-hidden rounded-2xl bg-graphite-900/10 sm:grid-cols-2 lg:grid-cols-5"
        >
          {PIPELINE.map((item) => (
            <motion.li
              key={item.step}
              variants={{
                initial: { opacity: 0, y: 12 },
                animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
              }}
              className="group bg-sand-50 p-6 transition-colors duration-300 hover:bg-white"
            >
              <span className="font-mono text-xs text-persimmon-600">{item.step}</span>
              <h3 className="mt-3 font-display text-xl">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite-600">{item.body}</p>
            </motion.li>
          ))}
        </motion.ol>
      </section>

      {/* Modules */}
      <section>
        <div className="border-b hairline pb-4">
          <p className="eyebrow">Modules</p>
          <h2 className="mt-2 text-display-md">Where to start</h2>
        </div>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {MODULES.map((module) => (
            <Link key={module.to} to={module.to} className="block">
              <Card interactive className="group h-full p-6">
                <div className="flex items-start justify-between">
                  <Badge tone={module.tone}>
                    <module.icon className="h-3 w-3" />
                  </Badge>
                  <ArrowUpRight className="h-4 w-4 text-graphite-400 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-persimmon-600" />
                </div>
                <h3 className="mt-6 font-display text-lg">{module.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-graphite-600">{module.body}</p>
              </Card>
            </Link>
          ))}
        </motion.div>
      </section>
    </div>
  );
}
