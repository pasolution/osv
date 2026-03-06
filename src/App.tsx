import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, FileJson, Folder, Loader, Search, X } from 'lucide-react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import './App.css'

interface TreeNode {
  id: string
  name: string
  type: 'tree' | 'blob'
  path: string
  children?: TreeNode[]
}

const GITLAB_PROJECT_ID = encodeURIComponent('osdu/data/data-definitions')
const GITLAB_API = 'https://community.opengroup.org/api/v4'
const GENERATED_PATH = 'Generated'
const RAW_URL_BASE = 'https://community.opengroup.org/osdu/data/data-definitions/-/raw/master'

function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [preSearchExpandedNodes, setPreSearchExpandedNodes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [viewMode, setViewMode] = useState<'viewer' | 'raw'>('viewer')
  const [rawJson, setRawJson] = useState<string>('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch the directory tree from GitLab API
  useEffect(() => {
    fetchRepositoryTree()
  }, [])

  // Fetch raw JSON when viewing raw mode
  useEffect(() => {
    if (viewMode === 'raw' && selectedSchema) {
      fetchRawJson()
    }
  }, [viewMode, selectedSchema])

  // Hide loading when raw JSON content is ready
  useEffect(() => {
    if (viewMode === 'raw' && rawJson) {
      setSchemaLoading(false)
    }
  }, [rawJson, viewMode])

  const fetchRawJson = async () => {
    if (!selectedSchema) return
    try {
      setSchemaLoading(true)
      // Use GitLab API to fetch file content
      const encodedPath = encodeURIComponent(selectedSchema)
      const apiUrl = `${GITLAB_API}/projects/${GITLAB_PROJECT_ID}/repository/files/${encodedPath}/raw?ref=master`
      const response = await fetch(apiUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch raw JSON')
      }
      const text = await response.text()
      // Parse and re-stringify to ensure valid JSON formatting
      const json = JSON.parse(text)
      setRawJson(JSON.stringify(json, null, 2))
    } catch (error) {
      console.error('Error fetching raw JSON:', error)
      setRawJson('Error loading raw JSON')
      setSchemaLoading(false)
    }
  }

  // Focus search input when activated
  useEffect(() => {
    if (searchActive && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [searchActive])

  // Update browser tab title with schema name
  useEffect(() => {
    if (selectedSchema) {
      const schemaName = selectedSchema.split('/').pop()?.replace('.json', '') || 'OSDU Schema Viewer'
      document.title = schemaName
    } else {
      document.title = 'OSDU Schema Viewer'
    }
  }, [selectedSchema])

  // Handle Escape key to close search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchActive) {
        setSearchQuery('')
        setSearchActive(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchActive])

  // Handle search activation - save expanded state
  useEffect(() => {
    if (searchActive) {
      setPreSearchExpandedNodes(new Set(expandedNodes))
    }
  }, [searchActive])

  // Handle search query changes - expand/collapse folders
  useEffect(() => {
    if (searchQuery.trim()) {
      // Expand all parents of matching items
      const allParentIds = new Set<string>()
      
      const collectParents = (nodes: TreeNode[]) => {
        nodes.forEach((node) => {
          const hasMatchingDescendant = checkForMatches(node)
          if (hasMatchingDescendant && node.type === 'tree') {
            allParentIds.add(node.id)
          }
          if (node.children) {
            collectParents(node.children)
          }
        })
      }
      
      collectParents(tree)
      setExpandedNodes(allParentIds)
    } else if (!searchActive) {
      // Restore previous expanded state when search is cleared and not active
      setExpandedNodes(preSearchExpandedNodes)
    }
  }, [searchQuery, tree, searchActive])

  const checkForMatches = (node: TreeNode): boolean => {
    const lowerQuery = searchQuery.toLowerCase()
    if (node.name.toLowerCase().includes(lowerQuery)) {
      return true
    }
    if (node.children) {
      return node.children.some(child => checkForMatches(child))
    }
    return false
  }

  const fetchRepositoryTree = async () => {
    try {
      setLoading(true)
      const allItems: any[] = []
      let page = 1
      let hasMore = true

      // Fetch all pages of results
      while (hasMore) {
        const response = await fetch(
          `${GITLAB_API}/projects/${GITLAB_PROJECT_ID}/repository/tree?path=${GENERATED_PATH}&recursive=true&per_page=100&page=${page}`
        )
        if (!response.ok) {
          throw new Error('Failed to fetch repository tree')
        }
        const data = await response.json()
        allItems.push(...data)

        // Check if there are more pages
        const linkHeader = response.headers.get('X-Next-Page')
        hasMore = linkHeader !== null && linkHeader !== ''
        page++
      }

      const treeStructure = buildTreeStructure(allItems)
      setTree(treeStructure)

      // Collapse all folders on initial load
      setExpandedNodes(new Set())
    } catch (error) {
      console.error('Error fetching repository tree:', error)
      setTree([])
    } finally {
      setLoading(false)
    }
  }

  // Extract schema base path and version number from a path
  const parseSchemaVersion = (path: string): { basePath: string; version: string } => {
    // For files like: Generated/master-data/BHARun.2.1.0.json
    // Extract the version from the filename before the .json extension
    // Match pattern: any characters, then dot, then version numbers (with dots), then .json
    const fileNameWithVersion = /^(.+?)\.(\d+(?:\.\d+)*)\.json$/
    const fileName = path.split('/').pop() || ''
    const match = fileName.match(fileNameWithVersion)
    
    if (match) {
      const versionStr = match[2]
      // Create basePath by replacing the full filename with just the base name
      const basePath = path.replace(fileName, match[1] + '.json')
      return { basePath, version: versionStr }
    }
    
    // Fallback: Try to match version pattern in folder structure like /v1.0.0/
    const folderVersionRegex = /\/(v\d+\.\d+(?:\.\d+)?)(?:\/|$)/
    const folderMatch = path.match(folderVersionRegex)
    
    if (folderMatch) {
      const versionStr = folderMatch[1]
      const basePath = path.replace(folderVersionRegex, '/VERSION_PLACEHOLDER/')
      return { basePath, version: versionStr }
    }
    
    return { basePath: path, version: '0.0.0' }
  }

  // Compare semantic versions
  const compareVersions = (v1: string, v2: string): number => {
    const parseVersion = (v: string) => {
      const parts = v.replace(/^v/, '').split('.').map(Number)
      return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 }
    }
    
    const ver1 = parseVersion(v1)
    const ver2 = parseVersion(v2)
    
    if (ver1.major !== ver2.major) return ver1.major - ver2.major
    if (ver1.minor !== ver2.minor) return ver1.minor - ver2.minor
    return ver1.patch - ver2.patch
  }

  // Filter items to keep only the most recent version of each schema
  const filterLatestVersions = (items: any[]): any[] => {
    // First, separate blobs (files) from trees (folders)
    const blobs = items.filter(item => item.type === 'blob')
    const trees = items.filter(item => item.type === 'tree')
    
    console.log('Total items before filtering:', items.length)
    console.log('Blobs (files):', blobs.length)
    console.log('Sample blob paths:', blobs.slice(0, 5).map(b => b.path))
    
    // Group blobs by their base schema path (without version)
    const schemaMap = new Map<string, any[]>()
    
    blobs.forEach((blob) => {
      const { basePath, version } = parseSchemaVersion(blob.path)
      console.log(`Blob: ${blob.path} -> basePath: ${basePath}, version: ${version}`)
      if (!schemaMap.has(basePath)) {
        schemaMap.set(basePath, [])
      }
      schemaMap.get(basePath)!.push(blob)
    })
    
    console.log('Unique schemas found:', schemaMap.size)
    
    // For each schema group, keep only the one with the latest version
    const filteredBlobs: any[] = []
    schemaMap.forEach((group, basePath) => {
      if (group.length === 1) {
        filteredBlobs.push(group[0])
      } else {
        console.log(`Schema ${basePath} has ${group.length} versions:`, group.map(g => g.path))
        // Sort by version and keep the latest
        const sorted = group.sort((a, b) => {
          const { version: v1 } = parseSchemaVersion(a.path)
          const { version: v2 } = parseSchemaVersion(b.path)
          return compareVersions(v2, v1) // descending order
        })
        console.log(`Keeping latest: ${sorted[0].path}`)
        filteredBlobs.push(sorted[0])
      }
    })
    
    // Collect all folder paths that are parents of kept blobs
    const requiredFolderPaths = new Set<string>()
    filteredBlobs.forEach((blob) => {
      const pathParts = blob.path.split('/')
      for (let i = 1; i < pathParts.length; i++) {
        const folderPath = pathParts.slice(0, i).join('/')
        requiredFolderPaths.add(folderPath)
      }
    })
    
    // Keep only folders that are parents of kept blobs
    const filteredTrees = trees.filter(tree => requiredFolderPaths.has(tree.path))
    
    console.log('Total items after filtering:', filteredBlobs.length + filteredTrees.length)
    return [...filteredTrees, ...filteredBlobs]
  }

  const buildTreeStructure = (items: any[]): TreeNode[] => {
    // Filter to keep only the latest version of each schema
    const filteredItems = filterLatestVersions(items)
    const allNodes = new Map<string, TreeNode>()

    // Create all nodes first - sort by path depth to process parents before children
    const sortedItems = filteredItems.sort((a, b) => 
      a.path.split('/').length - b.path.split('/').length
    )

    sortedItems.forEach((item) => {
      const node: TreeNode = {
        id: item.path,
        name: item.name,
        type: item.type,
        path: item.path,
        children: item.type === 'tree' ? [] : undefined
      }
      allNodes.set(item.path, node)
    })

    // Build parent-child relationships
    sortedItems.forEach((item) => {
      const pathParts = item.path.split('/')
      
      // Skip if this is a root item (direct child of Generated)
      if (pathParts.length === 2) return

      // Find the immediate parent
      const parentPath = pathParts.slice(0, -1).join('/')
      const parent = allNodes.get(parentPath)
      
      if (parent && parent.type === 'tree') {
        if (!parent.children) parent.children = []
        const node = allNodes.get(item.path)
        if (node && !parent.children.includes(node)) {
          parent.children.push(node)
        }
      }
    })

    // Collect root items (direct children of Generated folder)
    const roots = sortedItems
      .filter(item => item.path.split('/').length === 2)
      .map(item => allNodes.get(item.path)!)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    return roots
  }

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  // Filter tree nodes based on search query
  const filterTreeBySearch = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query.trim()) return nodes

    const lowerQuery = query.toLowerCase()
    
    return nodes.reduce<TreeNode[]>((result, node) => {
      const nameMatches = node.name.toLowerCase().includes(lowerQuery)
      let filteredChildren: TreeNode[] = []
      
      if (node.children) {
        filteredChildren = filterTreeBySearch(node.children, query)
      }
      
      // Include this node if:
      // 1. Its name matches the query, OR
      // 2. Any of its descendants match (children is not empty after filtering)
      if (nameMatches || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children
        })
      }
      
      return result
    }, [])
  }

  const getSchemaViewerUrl = (): string => {
    if (!selectedSchema) return ''
    const schemaUrl = `${RAW_URL_BASE}/${selectedSchema}`
    return `https://json-schema-viewer.vercel.app/view?url=${encodeURIComponent(schemaUrl)}&collapse_long_descriptions=on&deprecated_from_description=on&description_is_markdown=on&expand_buttons=on&show_breadcrumbs=on&show_toc=on&with_footer=on&template_name=js`
  }

  const renderTree = (nodes: TreeNode[]) => {
    return nodes.map((node) => (
      <div key={node.id} className="tree-item">
        <div className="tree-node">
          {node.type === 'tree' && node.children && node.children.length > 0 ? (
            <>
              <button
                className="expand-btn"
                onClick={() => toggleNode(node.id)}
              >
                {expandedNodes.has(node.id) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
              <Folder size={16} className="folder-icon" />
              <span className="node-name">{node.name}</span>
            </>
          ) : node.type === 'blob' ? (
            <>
              <div className="expand-placeholder" />
              <FileJson size={16} className="file-icon" />
              <button
                className={`node-name selectable ${selectedSchema === node.path ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedSchema(node.path)
                  setSchemaLoading(true)
                  setViewMode('viewer')
                }}
              >
                {node.name}
              </button>
            </>
          ) : (
            <>
              <div className="expand-placeholder" />
              <Folder size={16} className="folder-icon" />
              <span className="node-name">{node.name}</span>
            </>
          )}
        </div>
        {node.type === 'tree' && expandedNodes.has(node.id) && node.children && (
          <div className="tree-children">
            {renderTree(node.children)}
          </div>
        )}
      </div>
    ))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>OSDU Schema Viewer</h1>
      </header>
      <div className="app-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            {!searchActive && <h2>Schemas</h2>}
            {searchActive ? (
              <div className="search-input-wrapper">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search schemas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <button
                  className="search-close-btn"
                  onClick={() => {
                    setSearchQuery('')
                    setSearchActive(false)
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button
                className="search-btn"
                onClick={() => setSearchActive(true)}
                title="Search schemas"
              >
                <Search size={20} />
              </button>
            )}
          </div>
          <nav className="tree-container">
            {loading ? (
              <div className="loading">
                <Loader className="spinner" />
                <p>Loading schemas...</p>
              </div>
            ) : tree.length === 0 ? (
              <div className="empty">No schemas found</div>
            ) : (
              renderTree(filterTreeBySearch(tree, searchQuery))
            )}
          </nav>
        </aside>
        <main className="viewer">
          {selectedSchema ? (
            <>
              <div className="viewer-header">
                <h3>{selectedSchema.split('/').pop()}</h3>
                <button
                  className="view-mode-btn"
                  onClick={() => {
                    setSchemaLoading(true)
                    setViewMode(viewMode === 'viewer' ? 'raw' : 'viewer')
                  }}
                  title={`Switch to ${viewMode === 'viewer' ? 'raw JSON' : 'schema viewer'}`}
                >
                  {viewMode === 'viewer' ? 'JSON' : 'Viewer'}
                </button>
              </div>
              {schemaLoading && (
                <div className="viewer-loading">
                  <Loader className="spinner" />
                  <p>Loading schema...</p>
                </div>
              )}
              {viewMode === 'viewer' ? (
                <iframe
                  src={getSchemaViewerUrl()}
                  title="JSON Schema Viewer"
                  className="schema-iframe"
                  style={{ display: schemaLoading ? 'none' : 'flex' }}
                  onLoad={() => setSchemaLoading(false)}
                />
              ) : (
                <div className="raw-json-container" style={{ display: schemaLoading ? 'none' : 'block' }}>
                  <SyntaxHighlighter
                    language="json"
                    style={atomOneLight}
                    showLineNumbers={true}
                    wrapLongLines={true}
                  >
                    {rawJson}
                  </SyntaxHighlighter>
                </div>
              )}
            </>
          ) : (
            <div className="viewer-empty">
              <p>Select a schema from the left panel to view it</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
