"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThreadsIcon } from "@/components/icons/threads-icon";
import { SubstackIcon } from "@/components/icons/substack-icon";
import { extractPlainText } from "@/components/rich-editor";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Tab = "threads" | "substack";

interface ThreadsAnalyticsData {
  summary: {
    totalViews: number;
    totalLikes: number;
    totalReplies: number;
    totalReposts: number;
  };
  posts: {
    noteId: string;
    content: string;
    deliveredAt: string;
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }[];
  dailyTrends: {
    date: string;
    views: number;
    likes: number;
    replies: number;
  }[];
}

interface SubstackAnalyticsData {
  subscriber: {
    total: number;
    free: number | null;
    paid: number | null;
    lastUpdated: string;
  } | null;
  summary: {
    totalReactions: number;
    totalComments: number;
    totalRestacks: number;
    postCount: number;
  };
  posts: {
    postId: string;
    title: string | null;
    slug: string | null;
    postDate: string | null;
    type: string | null;
    reactions: number;
    comments: number;
    restacks: number;
    views: number | null;
  }[];
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-card rounded-[20px] border border-border p-5">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      <p className="font-mono text-2xl font-medium mt-1">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-3xl transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ThreadsAnalytics({ data }: { data: ThreadsAnalyticsData | null }) {
  if (!data || data.posts.length === 0) {
    return (
      <Card className="rounded-[20px]">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No Threads analytics yet. Post a note to Threads and check back
            after the next cron cycle.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Total Views" value={data.summary.totalViews} />
        <StatCard title="Total Likes" value={data.summary.totalLikes} />
        <StatCard title="Total Replies" value={data.summary.totalReplies} />
        <StatCard title="Total Reposts" value={data.summary.totalReposts} />
      </div>

      {data.dailyTrends.length > 1 && (
        <Card className="rounded-[20px]">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Daily Engagement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.dailyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DF" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="#7C9082"
                  strokeWidth={2}
                  dot={false}
                  name="Views"
                />
                <Line
                  type="monotone"
                  dataKey="likes"
                  stroke="#22C55E"
                  strokeWidth={2}
                  dot={false}
                  name="Likes"
                />
                <Line
                  type="monotone"
                  dataKey="replies"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  name="Replies"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-[20px]">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Post Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">
                    Post
                  </th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right font-mono">
                    Views
                  </th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right font-mono">
                    Likes
                  </th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right font-mono">
                    Replies
                  </th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right font-mono">
                    Reposts
                  </th>
                  <th className="pb-2 pl-2 font-medium text-muted-foreground text-right">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((post) => (
                  <tr key={post.noteId} className="border-b last:border-0">
                    <td className="py-2 pr-4 max-w-[200px] truncate">
                      {truncate(
                        extractPlainText(post.content).split("\n")[0],
                        50
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {post.views.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {post.likes.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {post.replies.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {post.reposts.toLocaleString()}
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap text-muted-foreground">
                      {post.deliveredAt
                        ? new Date(post.deliveredAt).toLocaleDateString()
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SubstackAnalytics({ data }: { data: SubstackAnalyticsData | null }) {
  if (!data || data.posts.length === 0) {
    return (
      <Card className="rounded-[20px]">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No Substack analytics yet. Add your publication subdomain in
            Settings and check back after the next cron cycle.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.subscriber && (
          <StatCard title="Subscribers" value={data.subscriber.total} />
        )}
        <StatCard title="Total Reactions" value={data.summary.totalReactions} />
        <StatCard title="Total Comments" value={data.summary.totalComments} />
        <StatCard title="Total Restacks" value={data.summary.totalRestacks} />
      </div>

      <Card className="rounded-[20px]">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Post Performance ({data.summary.postCount} posts)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">
                    Title
                  </th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right font-mono">
                    Reactions
                  </th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right font-mono">
                    Comments
                  </th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right font-mono">
                    Restacks
                  </th>
                  <th className="pb-2 pl-2 font-medium text-muted-foreground text-right">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((post) => (
                  <tr key={post.postId} className="border-b last:border-0">
                    <td className="py-2 pr-4 max-w-[250px] truncate">
                      {post.title ? truncate(post.title, 60) : "Untitled"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {post.reactions.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {post.comments.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {post.restacks.toLocaleString()}
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap text-muted-foreground">
                      {post.postDate
                        ? new Date(post.postDate).toLocaleDateString()
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("threads");
  const [threadsData, setThreadsData] = useState<ThreadsAnalyticsData | null>(
    null
  );
  const [substackData, setSubstackData] =
    useState<SubstackAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics/threads")
        .then((r) => r.json())
        .then(setThreadsData)
        .catch(() => {}),
      fetch("/api/analytics/substack")
        .then((r) => r.json())
        .then(setSubstackData)
        .catch(() => {}),
    ]).finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Track performance across your connected platforms"
      />

      <div className="px-8 pb-8">
        {/* Tab navigation - pill style */}
        <div className="flex items-center gap-2 mb-6">
          <TabButton
            active={activeTab === "threads"}
            onClick={() => setActiveTab("threads")}
          >
            <span className="flex items-center gap-1.5">
              <ThreadsIcon className="h-4 w-4" />
              Threads
            </span>
          </TabButton>
          <TabButton
            active={activeTab === "substack"}
            onClick={() => setActiveTab("substack")}
          >
            <span className="flex items-center gap-1.5">
              <SubstackIcon className="h-4 w-4" />
              Substack
            </span>
          </TabButton>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center">
            Loading analytics...
          </p>
        ) : activeTab === "threads" ? (
          <ThreadsAnalytics data={threadsData} />
        ) : (
          <SubstackAnalytics data={substackData} />
        )}
      </div>
    </div>
  );
}
